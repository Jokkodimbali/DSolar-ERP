import { randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { assertLocalIntegrationDatabase } from '../../../infrastructure/prisma/local-integration-database';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { PrismaStoreAccessRepository } from './prisma-store-access.repository';
import { PrismaInventoryRepository } from '../../inventory/infrastructure/prisma-inventory.repository';

const integration = process.env.TREASURY_INTEGRATION === '1' ? describe : describe.skip;
integration('Isolation des magasins PostgreSQL', () => {
  it('isole les magasins et révoque les sessions lors des changements d’accès', async () => {
    assertLocalIntegrationDatabase(process.env);
    const prisma = new PrismaService();
    const access = new PrismaStoreAccessRepository(prisma);
    const inventory = new PrismaInventoryRepository(prisma);
    const suffix = randomUUID().slice(0, 8);
    try {
      const adminRole = await prisma.role.upsert({
        where: { code: 'ADMIN' },
        update: {},
        create: { code: 'ADMIN', name: 'Admin' },
      });
      const role = await prisma.role.upsert({
        where: { code: 'MAGASINIER' },
        update: {},
        create: { code: 'MAGASINIER', name: 'Magasinier' },
      });
      const admin = await prisma.user.create({
        data: {
          email: suffix + '-admin-store@example.test',
          fullName: 'Admin CI',
          passwordHash: 'test',
          roles: { create: { roleId: adminRole.id } },
        },
      });
      const user = await prisma.user.create({
        data: {
          email: suffix + '-worker-store@example.test',
          fullName: 'Magasinier CI',
          passwordHash: 'test',
          roles: { create: { roleId: role.id } },
        },
      });
      const a = await prisma.store.create({ data: { code: 'ISO-A-' + suffix, name: 'Magasin A' } });
      const b = await prisma.store.create({ data: { code: 'ISO-B-' + suffix, name: 'Magasin B' } });
      const product = await prisma.product.create({ data: { sku: 'ISO-' + suffix, name: 'Produit CI' } });
      const session = await prisma.refreshSession.create({
        data: { userId: user.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60000) },
      });
      await expect(access.grant(user.id, b.id, user.id)).rejects.toBeInstanceOf(ForbiddenException);
      await access.grant(user.id, a.id, admin.id);
      expect(
        (await prisma.refreshSession.findUniqueOrThrow({ where: { id: session.id } })).revokedAt,
      ).not.toBeNull();
      expect((await access.listVisible(user.id)).map((store) => store.id)).toEqual([a.id]);
      expect((await access.listVisible(admin.id)).map((store) => store.id)).toContain(b.id);
      expect(await access.hasAccess(user.id, b.id)).toBe(false);
      await expect(inventory.getBalance(b.id, product.id, user.id)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(inventory.listStoreStock(b.id, user.id)).rejects.toBeInstanceOf(ForbiddenException);
      expect((await inventory.getBalance(a.id, product.id, user.id)).quantity).toBe('0.000');
      const command = {
        storeId: a.id,
        productId: product.id,
        actorId: user.id,
        operationKey: randomUUID(),
        direction: 'IN' as const,
        quantity: '2.125',
        reason: 'Ajustement CI',
      };
      expect((await inventory.adjust(command)).quantity).toBe('2.125');
      expect((await inventory.adjust(command)).quantity).toBe('2.125');
      const movement = await prisma.stockMovement.findUniqueOrThrow({
        where: { operationKey: command.operationKey },
      });
      expect(movement.actorId).toBe(user.id);
      const events = await prisma.auditLog.findMany({
        where: { entityType: 'StockMovement', entityId: movement.id },
      });
      expect(events).toHaveLength(1);
      expect(events[0].actorId).toBe(user.id);
      await expect(
        prisma.auditLog.update({ where: { id: events[0].id }, data: { action: 'FAKE' } }),
      ).rejects.toThrow();
      await expect(prisma.auditLog.delete({ where: { id: events[0].id } })).rejects.toThrow();
      await expect(prisma.$executeRaw`TRUNCATE TABLE "AuditLog"`).rejects.toThrow();
      expect((await prisma.auditLog.findUniqueOrThrow({ where: { id: events[0].id } })).action).toBe(
        'STOCK_MANUAL_ADJUSTMENT',
      );
      const renewed = await prisma.refreshSession.create({
        data: { userId: user.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60000) },
      });
      await access.grant(user.id, a.id, admin.id);
      expect(
        (await prisma.refreshSession.findUniqueOrThrow({ where: { id: renewed.id } })).revokedAt,
      ).toBeNull();
      await access.revoke(user.id, a.id, admin.id);
      expect(await access.listVisible(user.id)).toEqual([]);
      expect(
        (await prisma.refreshSession.findUniqueOrThrow({ where: { id: renewed.id } })).revokedAt,
      ).not.toBeNull();
      await expect(inventory.getBalance(a.id, product.id, user.id)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(
        await prisma.auditLog.count({
          where: { entityType: 'UserStoreAccess', entityId: user.id, actorId: admin.id },
        }),
      ).toBe(2);
    } finally {
      await prisma.$disconnect();
    }
  }, 30000);
});
