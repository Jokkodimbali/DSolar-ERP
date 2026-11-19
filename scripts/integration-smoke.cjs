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
    console.log('PASS PostgreSQL: migrations, unique stock, concurrent decrement, rollback');
  } finally {
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
