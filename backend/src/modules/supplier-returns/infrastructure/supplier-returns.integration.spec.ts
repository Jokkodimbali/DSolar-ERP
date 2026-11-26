import { randomUUID } from 'node:crypto';
import { assertLocalIntegrationDatabase } from '../../../infrastructure/prisma/local-integration-database';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PrismaGoodsReceiptsRepository } from '../../procurement/infrastructure/prisma-goods-receipts.repository';
import { SupplierReturnsRepository } from './supplier-returns.repository';

const integration = process.env.TREASURY_INTEGRATION === '1' ? describe : describe.skip;

integration('Retours fournisseurs PostgreSQL', () => {
  it('contrôle le cumul, les réservations, les avoirs et les doublons', async () => {
    assertLocalIntegrationDatabase(process.env);
    const prisma = new PrismaService();
    const repo = new SupplierReturnsRepository(prisma);
    const receipts = new PrismaGoodsReceiptsRepository(prisma);
    const suffix = randomUUID();
    try {
      const role = await prisma.role.upsert({
        where: { code: 'ADMIN' },
        update: {},
        create: { code: 'ADMIN', name: 'Administrateur' },
      });
      const admin = await prisma.user.create({
        data: {
          email: suffix + '@example.test',
          fullName: 'Admin CI',
          passwordHash: 'test',
          roles: { create: { roleId: role.id } },
        },
      });
      await expect(repo.list(randomUUID())).rejects.toBeInstanceOf(ForbiddenException);
      const store = await prisma.store.create({ data: { code: 'RET-' + suffix.slice(0, 8), name: 'CI' } });
      const product = await prisma.product.create({ data: { sku: suffix, name: 'Produit CI' } });
      const supplier = await prisma.supplier.create({ data: { name: 'Fournisseur CI' } });
      const order = await prisma.purchaseOrder.create({
        data: {
          number: suffix,
          supplierId: supplier.id,
          status: 'CONFIRMED',
          lines: { create: [{ productId: product.id, quantity: 10, unitCost: 100 }] },
        },
      });
      const receipt = await receipts.create(
        {
          number: suffix,
          storeId: store.id,
          purchaseOrderId: order.id,
          lines: [{ productId: product.id, quantity: 10, unitCost: 100 }],
        },
        admin.id,
      );
      await receipts.confirm(receipt.id, admin.id);
      const input = {
        receiptId: receipt.id,
        reason: 'Défaut',
        operationKey: randomUUID(),
        lines: [{ receiptLineId: receipt.lines[0].id, quantity: '6' }],
      };
      const draft = await repo.create(input, admin.id);
      expect((await repo.create(input, admin.id)).id).toBe(draft.id);
      await expect(repo.credit(draft.id, 'AV-1', admin.id)).rejects.toBeInstanceOf(ConflictException);
      const stockKey = { storeId_productId: { storeId: store.id, productId: product.id } };
      await prisma.storeStock.update({ where: stockKey, data: { reserved: 5 } });
      await expect(repo.confirm(draft.id, admin.id)).rejects.toBeInstanceOf(ConflictException);
      expect((await prisma.storeStock.findUniqueOrThrow({ where: stockKey })).quantity.toString()).toBe('10');
      await prisma.storeStock.update({ where: stockKey, data: { reserved: 0 } });
      await repo.confirm(draft.id, admin.id);
      await repo.confirm(draft.id, admin.id);
      expect((await prisma.storeStock.findUniqueOrThrow({ where: stockKey })).quantity.toString()).toBe('4');
      expect(await prisma.stockMovement.count({ where: { referenceId: draft.id } })).toBe(1);
      await expect(
        prisma.supplierReturnLine.update({
          where: { id: draft.lines[0].id },
          data: { quantity: '1', total: '100' },
        }),
      ).rejects.toThrow();
      await expect(prisma.supplierReturnLine.delete({ where: { id: draft.lines[0].id } })).rejects.toThrow();
      await expect(
        prisma.supplierReturn.update({ where: { id: draft.id }, data: { total: '1' } }),
      ).rejects.toThrow();
      expect(
        (await prisma.supplierReturn.findUniqueOrThrow({ where: { id: draft.id } })).total.toString(),
      ).toBe('600');
      const credit = await repo.credit(draft.id, 'AV-1', admin.id);
      expect(credit.amount.toString()).toBe('600');
      expect((await repo.credit(draft.id, 'AV-1', admin.id)).id).toBe(credit.id);
      const second = await repo.create({ ...input, operationKey: randomUUID() }, admin.id);
      await prisma.storeStock.update({ where: stockKey, data: { quantity: 20 } });
      await expect(repo.confirm(second.id, admin.id)).rejects.toBeInstanceOf(ConflictException);
      expect((await repo.cancel(second.id, 'Annulation', admin.id)).status).toBe('CANCELLED');
      await expect(repo.cancel(draft.id, 'Annulation', admin.id)).rejects.toBeInstanceOf(ConflictException);

      const serializedProduct = await prisma.product.create({
        data: { sku: suffix + '-S', name: 'Équipement CI' },
      });
      const serializedOrder = await prisma.purchaseOrder.create({
        data: {
          number: suffix + '-S',
          supplierId: supplier.id,
          status: 'CONFIRMED',
          lines: { create: [{ productId: serializedProduct.id, quantity: 2, unitCost: 500 }] },
        },
      });
      const serializedReceipt = await receipts.create(
        {
          number: suffix + '-S',
          storeId: store.id,
          purchaseOrderId: serializedOrder.id,
          lines: [{ productId: serializedProduct.id, quantity: 2, unitCost: 500 }],
        },
        admin.id,
      );
      await receipts.confirm(serializedReceipt.id, admin.id);
      const receiptLineId = serializedReceipt.lines[0].id;
      const registration = await repo.registerSerials(
        receiptLineId,
        [suffix + '-01', suffix + '-02'],
        admin.id,
      );
      expect(registration.count).toBe(2);
      const firstPage = await repo.availableSerials(receiptLineId, admin.id, { page: 1, limit: 1 });
      expect(firstPage.pagination).toEqual({ page: 1, limit: 1, total: 2, pages: 2 });
      const serialId = firstPage.items[0].id;
      const exact = await repo.availableSerials(receiptLineId, admin.id, {
        search: firstPage.items[0].serial,
      });
      expect(exact.items.map((item) => item.id)).toEqual([serialId]);
      await expect(repo.availableSerials(receiptLineId, randomUUID(), {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      const serialInput = {
        receiptId: serializedReceipt.id,
        reason: 'Équipement défectueux',
        operationKey: randomUUID(),
        lines: [{ receiptLineId, quantity: '1', serialIds: [serialId] }],
      };
      const serialDraft = await repo.create(serialInput, admin.id);
      const duplicateDraft = await repo.create({ ...serialInput, operationKey: randomUUID() }, admin.id);
      await repo.confirm(serialDraft.id, admin.id);
      await expect(repo.confirm(duplicateDraft.id, admin.id)).rejects.toBeInstanceOf(ConflictException);
      await expect(
        prisma.supplierReturnSerial.delete({
          where: { returnLineId_serialId: { returnLineId: serialDraft.lines[0].id, serialId } },
        }),
      ).rejects.toThrow();
      const serial = await prisma.serialNumber.findUniqueOrThrow({ where: { id: serialId } });
      expect(serial.status).toBe('RETURNED_TO_SUPPLIER');
      expect(serial.currentStoreId).toBeNull();
      const available = await repo.availableSerials(receiptLineId, admin.id, {});
      expect(available.pagination.total).toBe(1);
      expect(available.items.some((item) => item.id === serialId)).toBe(false);
      const serialStock = await prisma.storeStock.findUniqueOrThrow({
        where: { storeId_productId: { storeId: store.id, productId: serializedProduct.id } },
      });
      expect(serialStock.quantity.toString()).toBe('1');
    } finally {
      await prisma.$disconnect();
    }
  }, 30000);
});
