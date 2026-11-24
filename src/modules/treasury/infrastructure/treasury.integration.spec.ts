import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { TreasuryRepository } from './treasury.repository';

const integration = process.env.TREASURY_INTEGRATION === '1' ? describe : describe.skip;

integration('Trésorerie sur PostgreSQL réel', () => {
  it('contrôle les droits, les soldes, les transferts, les répétitions et la clôture', async () => {
    const url = new URL(process.env.DIRECT_URL || process.env.DATABASE_URL || 'invalid:');
    if (
      process.env.NODE_ENV !== 'test' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.pathname !== '/dsolar_test'
    ) {
      throw new Error('Base PostgreSQL de test locale requise.');
    }
    const prisma = new PrismaService();
    const repo = new TreasuryRepository(prisma);
    const suffix = randomUUID();
    try {
      const role = await prisma.role.upsert({
        where: { code: 'ADMIN' },
        update: {},
        create: { code: 'ADMIN', name: 'Administrateur' },
      });
      const admin = await prisma.user.create({
        data: {
          email: 'cash-admin-' + suffix + '@example.test',
          fullName: 'Admin CI',
          passwordHash: 'not-a-password',
          roles: { create: { roleId: role.id } },
        },
      });
      const other = await prisma.user.create({
        data: {
          email: 'cash-other-' + suffix + '@example.test',
          fullName: 'Utilisateur CI',
          passwordHash: 'not-a-password',
        },
      });
      const store = await prisma.store.create({
        data: { code: 'CASH-' + suffix.slice(0, 8), name: 'Magasin CI' },
      });
      await expect(repo.list(other.id)).rejects.toBeInstanceOf(ForbiddenException);
      const first = await repo.create(store.id, 'Caisse A', admin.id);
      const second = await repo.create(store.id, 'Caisse B', admin.id);
      const source = await repo.open(first.id, '100.00', admin.id);
      const target = await repo.open(second.id, '0.00', admin.id);
      await expect(repo.open(first.id, '0', admin.id)).rejects.toBeInstanceOf(ConflictException);
      await expect(repo.transfer(source.id, target.id, '101', randomUUID(), admin.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
      const key = randomUUID();
      const transfer = await repo.transfer(source.id, target.id, '40', key, admin.id);
      const repeated = await repo.transfer(source.id, target.id, '40', key, admin.id);
      expect(repeated.debit.id).toBe(transfer.debit.id);
      expect(repeated.credit.id).toBe(transfer.credit.id);
      expect(transfer.debit.amount.toString()).toBe('-40');
      expect(transfer.credit.amount.toString()).toBe('40');
      await expect(repo.transfer(source.id, target.id, '41', key, admin.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
      const movement = await repo.move(source.id, '10', 'Recette CI', randomUUID(), admin.id);
      const reversal = await repo.reverse(movement.id, 'Correction CI', randomUUID(), admin.id);
      expect(reversal.amount.toString()).toBe('-10');
      await expect(
        repo.reverse(movement.id, 'Deuxième correction', randomUUID(), admin.id),
      ).rejects.toBeInstanceOf(ConflictException);
      const results = await Promise.allSettled([
        repo.move(source.id, '-50', 'Sortie A', randomUUID(), admin.id),
        repo.move(source.id, '-50', 'Sortie B', randomUUID(), admin.id),
      ]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const summary = await repo.summary(source.id, admin.id);
      expect(summary.expected.toString()).toBe('10');
      const closed = await repo.close(source.id, '9', admin.id);
      expect(closed.difference.toString()).toBe('-1');
      await expect(repo.move(source.id, '1', 'Après clôture', randomUUID(), admin.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect((await repo.summary(target.id, admin.id)).expected.toString()).toBe('40');
      expect(await prisma.cashMovement.count({ where: { transferKey: key } })).toBe(2);
    } finally {
      await prisma.$disconnect();
    }
  }, 30000);
});
