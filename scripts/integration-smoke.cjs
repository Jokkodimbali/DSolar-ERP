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
  let supplierId;
  let purchaseOrderId;
  let receiptId;
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
    const supplier = await prisma.supplier.create({
      data: { name: 'Fournisseur integration ' + suffix },
    });
    supplierId = supplier.id;
    const order = await prisma.purchaseOrder.create({
      data: {
        number: 'PO-' + suffix,
        supplierId,
        lines: { create: [{ productId, quantity: new Prisma.Decimal(5), unitCost: new Prisma.Decimal(10) }] },
      },
    });
    purchaseOrderId = order.id;
    assert.equal(order.status, 'DRAFT', 'Purchase orders must start as drafts');
    const [confirmed, duplicateConfirmation] = await Promise.all([
      prisma.purchaseOrder.updateMany({
        where: { id: purchaseOrderId, status: 'DRAFT' },
        data: { status: 'CONFIRMED' },
      }),
      prisma.purchaseOrder.updateMany({
        where: { id: purchaseOrderId, status: 'DRAFT' },
        data: { status: 'CONFIRMED' },
      }),
    ]);
    assert.equal(confirmed.count + duplicateConfirmation.count, 1, 'Order confirmation must be atomic');
    const receipt = await prisma.goodsReceipt.create({
      data: {
        number: 'GR-' + suffix,
        purchaseOrderId,
        storeId,
        lines: { create: [{ productId, quantity: new Prisma.Decimal(2), unitCost: new Prisma.Decimal(10) }] },
      },
    });
    receiptId = receipt.id;
    assert.equal(receipt.status, 'DRAFT', 'Goods receipts must start as drafts');
    const transitioned = await prisma.goodsReceipt.updateMany({
      where: { id: receiptId, status: 'DRAFT' },
      data: { status: 'CANCELLED' },
    });
    assert.equal(transitioned.count, 1, 'Draft receipt cancellation must succeed');
    const duplicateCancellation = await prisma.goodsReceipt.updateMany({
      where: { id: receiptId, status: 'DRAFT' },
      data: { status: 'CANCELLED' },
    });
    assert.equal(duplicateCancellation.count, 0, 'Cancelled receipts cannot be cancelled twice');
    assert.equal(
      await prisma.stockMovement.count({ where: { referenceId: receiptId } }),
      0,
      'Cancelling a draft receipt must not create stock movements',
    );
    const beforeAuditFailure = await prisma.storeStock.findUniqueOrThrow({
      where: { storeId_productId: { storeId, productId } },
    });
    await assert.rejects(
      prisma.$transaction(async (tx) => {
        await tx.storeStock.update({
          where: { storeId_productId: { storeId, productId } },
          data: { quantity: { increment: new Prisma.Decimal(2) } },
        });
        await tx.stockMovement.create({
          data: {
            storeId,
            productId,
            type: 'RECEIPT',
            quantity: new Prisma.Decimal(2),
            referenceType: 'GOODS_RECEIPT',
            referenceId: receiptId,
            operationKey: 'ci-receipt-rollback:' + receiptId,
          },
        });
        await tx.purchaseOrder.update({
          where: { id: purchaseOrderId },
          data: { status: 'PARTIALLY_DELIVERED' },
        });
        await tx.goodsReceipt.update({
          where: { id: receiptId },
          data: { status: 'CONFIRMED' },
        });
        throw new Error('simulated audit failure');
      }),
      /simulated audit failure/,
    );
    const afterAuditFailure = await prisma.storeStock.findUniqueOrThrow({
      where: { storeId_productId: { storeId, productId } },
    });
    assert.equal(
      afterAuditFailure.quantity.toString(),
      beforeAuditFailure.quantity.toString(),
      'Failed receipt audit must roll back stock quantity',
    );
    assert.equal(
      await prisma.stockMovement.count({ where: { referenceId: receiptId } }),
      0,
      'Failed receipt audit must roll back stock movements',
    );
    assert.equal(
      (await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: purchaseOrderId } })).status,
      'CONFIRMED',
      'Failed receipt audit must restore purchase order status',
    );
    assert.equal(
      (await prisma.goodsReceipt.findUniqueOrThrow({ where: { id: receiptId } })).status,
      'CANCELLED',
      'Failed receipt audit must restore receipt status',
    );
    console.log('PASS PostgreSQL: stock concurrency, rollback, physical count and audit movement');
    console.log('PASS PostgreSQL: purchase order confirmation and draft receipt cancellation');
  } finally {
    if (receiptId) {
      await prisma.goodsReceiptLine.deleteMany({ where: { receiptId } });
      await prisma.goodsReceipt.delete({ where: { id: receiptId } });
    }
    if (purchaseOrderId) {
      await prisma.purchaseOrderLine.deleteMany({ where: { orderId: purchaseOrderId } });
      await prisma.purchaseOrder.delete({ where: { id: purchaseOrderId } });
    }
    if (supplierId) await prisma.supplier.delete({ where: { id: supplierId } });
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
