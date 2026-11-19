// Integration smoke tests run ONLY against a disposable local PostgreSQL database.
// Never run this script against Neon, staging or production.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient, Prisma } = require('@prisma/client');

async function main() {
  const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DIRECT_URL/DATABASE_URL is required.');
  const url = new URL(databaseUrl);
  if (
    !['localhost', '127.0.0.1', '::1'].includes(url.hostname) ||
    url.pathname !== '/dsolar_test' ||
    process.env.NODE_ENV !== 'test'
  ) {
    throw new Error('Integration tests require NODE_ENV=test and local database dsolar_test.');
  }

  const prisma = new PrismaClient();
  const suffix = randomUUID().slice(0, 8);
  const storeCode = 'CI-' + suffix;
  const sku = 'CI-' + suffix;
  let storeId;
  let productId;
  let inventoryId;
  try {
    const store = await prisma.store.create({
      data: { code: storeCode, name: 'Magasin integration CI' },
    });
    storeId = store.id;
    const product = await prisma.product.create({
      data: { sku, name: 'Produit integration CI' },
    });
    productId = product.id;
    const stock = await prisma.storeStock.create({
      data: { storeId, productId, quantity: new Prisma.Decimal(10), reserved: new Prisma.Decimal(2) },
    });

    const duplicate = await prisma.storeStock.create({
      data: { storeId, productId, quantity: new Prisma.Decimal(1) },
    }).then(() => false, (error) => error.code === 'P2002');
    assert.equal(duplicate, true, 'Unique store/product stock constraint must be enforced');

    const [first, second] = await Promise.all([
      prisma.storeStock.updateMany({
        where: { id: stock.id, quantity: { gte: new Prisma.Decimal(8) } },
        data: { quantity: { decrement: new Prisma.Decimal(8) } },
      }),
      prisma.storeStock.updateMany({
        where: { id: stock.id, quantity: { gte: new Prisma.Decimal(8) } },
        data: { quantity: { decrement: new Prisma.Decimal(8) } },
      }),
    ]);
    assert.equal(first.count + second.count, 1, 'Concurrent stock consumption must be atomic');
    const after = await prisma.storeStock.findUniqueOrThrow({ where: { id: stock.id } });
    assert.equal(after.quantity.toString(), '2', 'Stock must not become negative');

    await assert.rejects(
      prisma.$transaction(async (tx) => {
        await tx.storeStock.update({
          where: { id: stock.id },
          data: { quantity: { increment: new Prisma.Decimal(5) } },
        });
        throw new Error('intentional rollback');
      }),
      /intentional rollback/,
    );
    const rolledBack = await prisma.storeStock.findUniqueOrThrow({ where: { id: stock.id } });
    assert.equal(rolledBack.quantity.toString(), '2', 'Failed transaction must roll back');
    const session = await prisma.inventorySession.create({
      data: {
        storeId,
        lines: { create: [{ productId, expected: new Prisma.Decimal(2) }] },
      },
      include: { lines: true },
    });
    inventoryId = session.id;
    assert.equal(session.status, 'DRAFT', 'New physical count must be a draft');
    assert.equal(session.lines.length, 1, 'Physical count must snapshot stock lines');

    await prisma.inventoryLine.update({
      where: { sessionId_productId: { sessionId: inventoryId, productId } },
      data: { counted: new Prisma.Decimal(3), reason: 'Comptage CI' },
    });
    await assert.rejects(
      prisma.$transaction(async (tx) => {
        const changed = await tx.storeStock.updateMany({
          where: { id: stock.id, quantity: new Prisma.Decimal(2), reserved: { lte: 3 } },
          data: { quantity: { increment: new Prisma.Decimal(1) } },
        });
        assert.equal(changed.count, 1);
        await tx.stockMovement.create({
          data: {
            storeId,
            productId,
            type: 'INVENTORY_ADJUSTMENT',
            quantity: new Prisma.Decimal(1),
            referenceType: 'INVENTORY_SESSION',
            referenceId: inventoryId,
            operationKey: 'inventory:' + inventoryId + ':' + productId,
            reason: 'Comptage CI',
          },
        });
        throw new Error('rollback inventory validation');
      }),
      /rollback inventory validation/,
    );
    const unchanged = await prisma.storeStock.findUniqueOrThrow({ where: { id: stock.id } });
    assert.equal(unchanged.quantity.toString(), '2', 'Inventory transaction rollback must restore stock');
    assert.equal(
      await prisma.stockMovement.count({ where: { referenceId: inventoryId } }),
      0,
      'Inventory rollback must not leave orphaned movements',
    );

    await prisma.$transaction(async (tx) => {
      const changed = await tx.storeStock.updateMany({
        where: { id: stock.id, quantity: new Prisma.Decimal(2), reserved: { lte: 3 } },
        data: { quantity: { increment: new Prisma.Decimal(1) } },
      });
      assert.equal(changed.count, 1);
      await tx.stockMovement.create({
        data: {
          storeId,
          productId,
          type: 'INVENTORY_ADJUSTMENT',
          quantity: new Prisma.Decimal(1),
          referenceType: 'INVENTORY_SESSION',
          referenceId: inventoryId,
          operationKey: 'inventory:' + inventoryId + ':' + productId,
          reason: 'Comptage CI',
        },
      });
      const updated = await tx.inventorySession.updateMany({
        where: { id: inventoryId, status: 'DRAFT' },
        data: { status: 'VALIDATED', validatedAt: new Date() },
      });
      assert.equal(updated.count, 1);
    });
    const countedStock = await prisma.storeStock.findUniqueOrThrow({ where: { id: stock.id } });
    assert.equal(countedStock.quantity.toString(), '3', 'Validated count must reconcile physical stock');
    assert.equal(
      await prisma.stockMovement.count({ where: { referenceId: inventoryId } }),
      1,
      'Validated count must create exactly one traceable movement',
    );
    const repeated = await prisma.inventorySession.updateMany({
      where: { id: inventoryId, status: 'DRAFT' },
      data: { status: 'VALIDATED' },
    });
    assert.equal(repeated.count, 0, 'A validated count cannot be validated twice');
    console.log('PASS PostgreSQL: stock concurrency, rollback, physical count and audit movement');
  } finally {
    if (inventoryId) {
      await prisma.stockMovement.deleteMany({ where: { referenceId: inventoryId } });
      await prisma.inventoryLine.deleteMany({ where: { sessionId: inventoryId } });
      await prisma.inventorySession.delete({ where: { id: inventoryId } });
    }
    if (storeId && productId) {
      await prisma.storeStock.deleteMany({ where: { storeId, productId } });
    }
    if (productId) await prisma.product.delete({ where: { id: productId } });
    if (storeId) await prisma.store.delete({ where: { id: storeId } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
