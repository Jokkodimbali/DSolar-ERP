import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PrismaGoodsReceiptsRepository } from '../../procurement/infrastructure/prisma-goods-receipts.repository';
import { SupplierReturnsRepository } from './supplier-returns.repository';

const integration = process.env.TREASURY_INTEGRATION === '1' ? describe : describe.skip;

integration('Retours fournisseurs PostgreSQL', () => {
  it('contrôle le cumul, les réservations, les avoirs et les doublons', async () => {
    const url = new URL(process.env.DIRECT_URL || process.env.DATABASE_URL || 'invalid:');
    if (process.env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.pathname !== '/dsolar_test') throw new Error('Base de test locale requise.');
    const prisma = new PrismaService();
    const repo = new SupplierReturnsRepository(prisma);
    const receipts = new PrismaGoodsReceiptsRepository(prisma);
    const suffix = randomUUID();
    try {
      const role = await prisma.role.upsert({
        where: { code: 'ADMIN' }, update: {}, create: { code: 'ADMIN', name: 'Administrateur' },
      });
      const admin = await prisma.user.create({
        data: { email: suffix + '@example.test', fullName: 'Admin CI', passwordHash: 'test',
          roles: { create: { roleId: role.id } } },
      });
      await expect(repo.list(randomUUID())).rejects.toBeInstanceOf(ForbiddenException);
      const store = await prisma.store.create({ data: { code: 'RET-' + suffix.slice(0, 8), name: 'CI' } });
      const product = await prisma.product.create({ data: { sku: suffix, name: 'Produit CI' } });
      const supplier = await prisma.supplier.create({ data: { name: 'Fournisseur CI' } });
      const order = await prisma.purchaseOrder.create({
        data: { number: suffix, supplierId: supplier.id, status: 'CONFIRMED',
          lines: { create: [{ productId: product.id, quantity: 10, unitCost: 100 }] } },
      });
      const receipt = await receipts.create({
        number: suffix, storeId: store.id, purchaseOrderId: order.id,
        lines: [{ productId: product.id, quantity: 10, unitCost: 100 }],
      }, admin.id);
      await receipts.confirm(receipt.id, admin.id);
      const input = { receiptId: receipt.id, reason: 'Défaut', operationKey: randomUUID(),
        lines: [{ receiptLineId: receipt.lines[0].id, quantity: '6' }] };
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
      const credit = await repo.credit(draft.id, 'AV-1', admin.id);
      expect(credit.amount.toString()).toBe('600');
      expect((await repo.credit(draft.id, 'AV-1', admin.id)).id).toBe(credit.id);
      const second = await repo.create({ ...input, operationKey: randomUUID() }, admin.id);
      await prisma.storeStock.update({ where: stockKey, data: { quantity: 20 } });
      await expect(repo.confirm(second.id, admin.id)).rejects.toBeInstanceOf(ConflictException);
      expect((await repo.cancel(second.id, 'Annulation', admin.id)).status).toBe('CANCELLED');
      await expect(repo.cancel(draft.id, 'Annulation', admin.id)).rejects.toBeInstanceOf(ConflictException);
    } finally {
      await prisma.$disconnect();
    }
  }, 30000);
});
