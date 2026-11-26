import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { assertLocalIntegrationDatabase } from '../../../infrastructure/prisma/local-integration-database';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { CompanySettingsInput } from '../application/company-settings.port';
import { PrismaCompanySettingsRepository } from './prisma-company-settings.repository';
import { PrismaProcurementSearchRepository } from '../../procurement/infrastructure/prisma-procurement-search.repository';
import { PrismaNotificationsRepository } from '../../notifications/infrastructure/prisma-notifications.repository';

const integration = process.env.TREASURY_INTEGRATION === '1' ? describe : describe.skip;

integration('Paramètres et notifications PostgreSQL', () => {
  it('protège les paramètres versionnés, conserve l’identité historique et isole les lectures', async () => {
    assertLocalIntegrationDatabase(process.env);
    const prisma = new PrismaService();
    const suffix = randomUUID().slice(0, 8);
    const settings = new PrismaCompanySettingsRepository(prisma);
    const notifications = new PrismaNotificationsRepository(prisma);
    try {
      const adminRole = await prisma.role.upsert({
        where: { code: 'ADMIN' },
        update: {},
        create: { code: 'ADMIN', name: 'Admin' },
      });
      const workerRole = await prisma.role.upsert({
        where: { code: 'MAGASINIER' },
        update: {},
        create: { code: 'MAGASINIER', name: 'Magasinier' },
      });
      const permission = await prisma.permission.upsert({
        where: { code: 'inventory.read' },
        update: {},
        create: { code: 'inventory.read', description: 'Lecture du stock' },
      });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: workerRole.id, permissionId: permission.id } },
        update: {},
        create: { roleId: workerRole.id, permissionId: permission.id },
      });
      const actor = async (label: string, roleId: string) =>
        prisma.user.create({
          data: {
            email: label + '-' + suffix + '@example.test',
            fullName: label,
            passwordHash: 'test',
            roles: { create: { roleId } },
          },
        });
      const admin = await actor('admin-settings', adminRole.id);
      const worker = await actor('worker-settings', workerRole.id);
      const other = await actor('other-settings', workerRole.id);
      const input: CompanySettingsInput = {
        legalName: 'Entreprise CI ' + suffix,
        tradeName: '',
        taxId: '',
        registrationNumber: '',
        legalForm: '',
        address: '',
        phone: '',
        email: '',
        website: '',
        logoUrl: '',
        bankName: '',
        bankAccount: '',
        documentFooter: '',
        notificationsEnabled: true,
        lowStockThreshold: 5,
      };
      const revision = (await settings.current(admin.id))?.revision ?? 0;
      await expect(settings.save(worker.id, revision, input)).rejects.toBeInstanceOf(ForbiddenException);
      const first = await settings.save(admin.id, revision, input);
      await expect(settings.save(admin.id, revision, input)).rejects.toBeInstanceOf(ConflictException);
      const store = await prisma.store.create({ data: { code: 'NOTIF-' + suffix, name: 'Magasin CI' } });
      const foreign = await prisma.store.create({
        data: { code: 'OTHER-' + suffix, name: 'Autre magasin CI' },
      });
      await prisma.userStoreAccess.createMany({
        data: [
          { userId: worker.id, storeId: store.id },
          { userId: other.id, storeId: foreign.id },
        ],
      });
      const product = await prisma.product.create({ data: { sku: 'NOTIF-' + suffix, name: 'Produit CI' } });
      const customer = await prisma.customer.create({ data: { name: 'Client CI' } });
      const doc = await prisma.proforma.create({
        data: {
          number: 'CFG-' + suffix,
          customerId: customer.id,
          total: '100.00',
          lines: {
            create: [
              { storeId: store.id, productId: product.id, quantity: '1', unitPrice: '100', lineTotal: '100' },
            ],
          },
        },
      });
      await prisma.proforma.update({
        where: { id: doc.id },
        data: { status: 'ISSUED', issuedAt: new Date() },
      });
      const next = await settings.save(admin.id, first.revision, {
        ...input,
        legalName: 'Nouvelle identité CI',
      });
      expect(next.revision).toBe(first.revision + 1);
      const historical = await prisma.proforma.findUniqueOrThrow({
        where: { id: doc.id },
        include: { companySettings: true },
      });
      expect(historical.companySettings?.legalName).toBe(input.legalName);
      await expect(
        prisma.companySettings.update({ where: { id: first.id }, data: { legalName: 'Falsification' } }),
      ).rejects.toThrow();
      const stock = await prisma.storeStock.create({
        data: { storeId: store.id, productId: product.id, quantity: '10' },
      });
      await prisma.storeStock.update({ where: { id: stock.id }, data: { quantity: '5' } });
      await prisma.storeStock.update({ where: { id: stock.id }, data: { quantity: '4' } });
      const events = await prisma.auditLog.findMany({ where: { action: 'LOW_STOCK', entityId: stock.id } });
      expect(events).toHaveLength(1);
      const id = events[0].id;
      const transfer = await prisma.stockTransfer.create({
        data: {
          number: 'TR-' + suffix,
          originId: store.id,
          destinationId: foreign.id,
          createdById: admin.id,
        },
      });
      const transferEvent = await prisma.auditLog.create({
        data: {
          actorId: admin.id,
          action: 'TRANSFER_SHIPPED',
          entityType: 'StockTransfer',
          entityId: transfer.id,
          storeId: store.id,
          payload: { originId: store.id, destinationId: foreign.id },
        },
      });
      expect((await notifications.feed(worker.id, { action: 'TRANSFER_SHIPPED' })).items).toContainEqual(
        expect.objectContaining({ id: transferEvent.id }),
      );
      expect((await notifications.feed(other.id, { storeId: foreign.id })).items).toContainEqual(
        expect.objectContaining({ id: transferEvent.id }),
      );
      const procurement = new PrismaProcurementSearchRepository(prisma);
      const supplier = await prisma.supplier.create({ data: { name: 'Fournisseur ' + suffix } });
      const purchase = await prisma.purchaseOrder.create({
        data: { number: 'PO-' + suffix, supplierId: supplier.id },
      });
      await prisma.goodsReceipt.create({
        data: { number: 'BR-' + suffix, purchaseOrderId: purchase.id, storeId: store.id },
      });
      expect(
        (await procurement.search('receipts', worker.id, { search: 'BR-' + suffix })).pagination.total,
      ).toBe(1);
      expect(
        (await procurement.search('receipts', other.id, { search: 'BR-' + suffix })).pagination.total,
      ).toBe(0);
      const feed = await notifications.feed(worker.id);
      expect(feed.items).toContainEqual(expect.objectContaining({ id, read: false, storeId: store.id }));
      expect((await notifications.feed(other.id)).items.some((item) => item.id === id)).toBe(false);
      await expect(notifications.mark(other.id, id)).rejects.toBeInstanceOf(NotFoundException);
      expect(await notifications.mark(worker.id, id)).toBe(1);
      expect(await notifications.mark(worker.id, id)).toBe(0);
      expect((await notifications.feed(worker.id)).items).toContainEqual(
        expect.objectContaining({ id, read: true }),
      );
      expect((await notifications.feed(admin.id)).items).toContainEqual(
        expect.objectContaining({ id, read: false }),
      );
      const disabled = await settings.save(admin.id, next.revision, {
        ...input,
        notificationsEnabled: false,
      });
      expect(await notifications.feed(worker.id)).toEqual({ enabled: false, unread: 0, items: [] });
      await settings.save(admin.id, disabled.revision, input);
    } finally {
      await prisma.$disconnect();
    }
  }, 60000);
});
