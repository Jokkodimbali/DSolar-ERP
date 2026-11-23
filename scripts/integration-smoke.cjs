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
    const beforeDuplicateMovement = await prisma.storeStock.findUniqueOrThrow({
      where: { storeId_productId: { storeId, productId } },
    });
    const duplicateOperationKey = 'ci-receipt-unique:' + receiptId;
    await assert.rejects(
      prisma.$transaction(async (tx) => {
        await tx.storeStock.update({
          where: { storeId_productId: { storeId, productId } },
          data: { quantity: { increment: new Prisma.Decimal(4) } },
        });
        const movement = {
          storeId,
          productId,
          type: 'RECEIPT',
          quantity: new Prisma.Decimal(2),
          referenceType: 'GOODS_RECEIPT',
          referenceId: receiptId,
          operationKey: duplicateOperationKey,
        };
        await tx.stockMovement.create({ data: movement });
        await tx.stockMovement.create({ data: movement });
      }),
      (error) => error.code === 'P2002',
      'Duplicate operation keys must be rejected by PostgreSQL',
    );
    assert.equal(
      (await prisma.storeStock.findUniqueOrThrow({
        where: { storeId_productId: { storeId, productId } },
      })).quantity.toString(),
      beforeDuplicateMovement.quantity.toString(),
      'Duplicate movement must roll back stock increment',
    );
    assert.equal(
      await prisma.stockMovement.count({ where: { operationKey: duplicateOperationKey } }),
      0,
      'Duplicate movement must not leave an orphaned stock trace',
    );
    const concurrentReceiptIds = [];
    try {
      for (const index of [1, 2]) {
        const draft = await prisma.goodsReceipt.create({
          data: {
            number: 'GR-RACE-' + index + '-' + suffix,
            purchaseOrderId,
            storeId,
            lines: {
              create: [{ productId, quantity: new Prisma.Decimal(3), unitCost: new Prisma.Decimal(10) }],
            },
          },
        });
        concurrentReceiptIds.push(draft.id);
      }
      const confirmConcurrent = async (id) => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            return await prisma.$transaction(
              async (tx) => {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${purchaseOrderId}))`;
                const orderState = await tx.purchaseOrder.findUniqueOrThrow({
                  where: { id: purchaseOrderId },
                  include: { lines: true },
                });
                assert.ok(['CONFIRMED', 'PARTIALLY_DELIVERED'].includes(orderState.status));
                const previous = await tx.goodsReceipt.findMany({
                  where: { purchaseOrderId, status: 'CONFIRMED' },
                  include: { lines: true },
                });
                const received = previous.reduce(
                  (sum, entry) => sum.plus(
                    entry.lines.filter((line) => line.productId === productId).reduce(
                      (subtotal, line) => subtotal.plus(line.quantity),
                      new Prisma.Decimal(0),
                    ),
                  ),
                  new Prisma.Decimal(0),
                );
                const ordered = orderState.lines.find((line) => line.productId === productId).quantity;
                if (received.plus(3).greaterThan(ordered)) return false;
                await tx.goodsReceipt.update({
                  where: { id },
                  data: { status: 'CONFIRMED' },
                });
                await tx.storeStock.update({
                  where: { storeId_productId: { storeId, productId } },
                  data: { quantity: { increment: new Prisma.Decimal(3) } },
                });
                await tx.stockMovement.create({
                  data: {
                    storeId,
                    productId,
                    type: 'RECEIPT',
                    quantity: new Prisma.Decimal(3),
                    referenceType: 'GOODS_RECEIPT',
                    referenceId: id,
                    operationKey: 'ci-race:' + id + ':' + productId,
                  },
                });
                await tx.purchaseOrder.update({
                  where: { id: purchaseOrderId },
                  data: { status: received.plus(3).equals(ordered) ? 'DELIVERED' : 'PARTIALLY_DELIVERED' },
                });
                return true;
              },
              { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
            );
          } catch (error) {
            if (error.code !== 'P2034' || attempt === 2) throw error;
          }
        }
      };
      const raceStockBefore = await prisma.storeStock.findUniqueOrThrow({
        where: { storeId_productId: { storeId, productId } },
      });
      const outcomes = await Promise.all(concurrentReceiptIds.map(confirmConcurrent));
      assert.equal(outcomes.filter(Boolean).length, 1, 'Only one competing receipt may be confirmed');
      const raceStockAfter = await prisma.storeStock.findUniqueOrThrow({
        where: { storeId_productId: { storeId, productId } },
      });
      assert.equal(
        raceStockAfter.quantity.minus(raceStockBefore.quantity).toString(),
        '3',
        'Concurrent receipts must increase stock exactly once',
      );
      assert.equal(
        await prisma.stockMovement.count({ where: { referenceId: { in: concurrentReceiptIds } } }),
        1,
        'Concurrent receipts must create only one stock movement',
      );
      assert.equal(
        (await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: purchaseOrderId } })).status,
        'PARTIALLY_DELIVERED',
      );
    } finally {
      await prisma.stockMovement.deleteMany({ where: { referenceId: { in: concurrentReceiptIds } } });
      await prisma.goodsReceiptLine.deleteMany({ where: { receiptId: { in: concurrentReceiptIds } } });
      await prisma.goodsReceipt.deleteMany({ where: { id: { in: concurrentReceiptIds } } });
      await prisma.purchaseOrder.update({
        where: { id: purchaseOrderId },
        data: { status: 'CONFIRMED' },
      });
    }
    const duplicateReceiptIds = [];
    try {
      const duplicateDraft = await prisma.goodsReceipt.create({
        data: {
          number: 'GR-IDEMP-' + suffix,
          purchaseOrderId,
          storeId,
          lines: {
            create: [{ productId, quantity: new Prisma.Decimal(1), unitCost: new Prisma.Decimal(10) }],
          },
        },
      });
      duplicateReceiptIds.push(duplicateDraft.id);
      const stockBeforeIdempotency = await prisma.storeStock.findUniqueOrThrow({
        where: { storeId_productId: { storeId, productId } },
      });
      const confirmOnce = () =>
        prisma.$transaction(async (tx) => {
          const updated = await tx.goodsReceipt.updateMany({
            where: { id: duplicateDraft.id, status: 'DRAFT' },
            data: { status: 'CONFIRMED' },
          });
          if (updated.count === 0) return false;
          await tx.storeStock.update({
            where: { storeId_productId: { storeId, productId } },
            data: { quantity: { increment: new Prisma.Decimal(1) } },
          });
          await tx.stockMovement.create({
            data: {
              storeId,
              productId,
              type: 'RECEIPT',
              quantity: new Prisma.Decimal(1),
              referenceType: 'GOODS_RECEIPT',
              referenceId: duplicateDraft.id,
              operationKey: 'ci-idempotent:' + duplicateDraft.id,
            },
          });
          return true;
        });
      const confirmations = await Promise.all([confirmOnce(), confirmOnce()]);
      assert.equal(
        confirmations.filter(Boolean).length,
        1,
        'The same receipt must not be confirmed twice',
      );
      assert.equal(
        (await prisma.storeStock.findUniqueOrThrow({
          where: { storeId_productId: { storeId, productId } },
        })).quantity.minus(stockBeforeIdempotency.quantity).toString(),
        '1',
        'Repeated confirmation must increase stock only once',
      );
      assert.equal(
        await prisma.stockMovement.count({ where: { referenceId: duplicateDraft.id } }),
        1,
        'Repeated confirmation must create exactly one stock movement',
      );
    } finally {
      await prisma.stockMovement.deleteMany({ where: { referenceId: { in: duplicateReceiptIds } } });
      await prisma.goodsReceiptLine.deleteMany({ where: { receiptId: { in: duplicateReceiptIds } } });
      await prisma.goodsReceipt.deleteMany({ where: { id: { in: duplicateReceiptIds } } });
    }
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
