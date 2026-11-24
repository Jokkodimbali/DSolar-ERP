import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { TreasuryRepository } from '../../treasury/infrastructure/treasury.repository';
import { ExpensesRepository } from './expenses.repository';

const integration = process.env.TREASURY_INTEGRATION === '1' ? describe : describe.skip;

integration('Dépenses sur PostgreSQL réel', () => {
  it('valide le cycle de dépense et son intégration atomique avec la caisse', async () => {
    const url = new URL(process.env.DIRECT_URL || process.env.DATABASE_URL || 'invalid:');
    if (
      process.env.NODE_ENV !== 'test' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.pathname !== '/dsolar_test'
    ) {
      throw new Error('Base PostgreSQL de test locale requise.');
    }
    const prisma = new PrismaService();
    const expenses = new ExpensesRepository(prisma);
    const treasury = new TreasuryRepository(prisma);
    const suffix = randomUUID();
    try {
      const role = await prisma.role.upsert({
        where: { code: 'ADMIN' },
        update: {},
        create: { code: 'ADMIN', name: 'Administrateur' },
      });
      const admin = await prisma.user.create({
        data: {
          email: 'expense-' + suffix + '@example.test',
          fullName: 'Admin CI',
          passwordHash: 'not-a-password',
          roles: { create: { roleId: role.id } },
        },
      });
      await expect(expenses.list(randomUUID())).rejects.toBeInstanceOf(ForbiddenException);
      const store = await prisma.store.create({
        data: { code: 'EXP-' + suffix.slice(0, 8), name: 'Magasin dépenses CI' },
      });
      const category = await expenses.createCategory('Transport ' + suffix, admin.id);
      const register = await treasury.create(store.id, 'Caisse dépenses', admin.id);
      const session = await treasury.open(register.id, '100', admin.id);
      const input = {
        storeId: store.id,
        categoryId: category.id,
        description: 'Transport',
        amount: '70',
        operationKey: randomUUID(),
      };
      const expense = await expenses.create(input, admin.id);
      expect((await expenses.create(input, admin.id)).id).toBe(expense.id);
      await expect(
        expenses.pay(expense.id, { method: 'CASH', sessionId: session.id }, admin.id),
      ).rejects.toBeInstanceOf(ConflictException);
      await expenses.approve(expense.id, admin.id);
      const paid = await expenses.pay(expense.id, { method: 'CASH', sessionId: session.id }, admin.id);
      expect(paid.status).toBe('PAID');
      expect((await treasury.summary(session.id, admin.id)).expected.toString()).toBe('30');
      await expect(
        treasury.reverse(paid.cashMovementId ?? '', 'Annulation manuelle', randomUUID(), admin.id),
      ).rejects.toBeInstanceOf(ConflictException);
      const second = await expenses.create({ ...input, operationKey: randomUUID() }, admin.id);
      await expenses.approve(second.id, admin.id);
      await expect(
        expenses.pay(second.id, { method: 'CASH', sessionId: session.id }, admin.id),
      ).rejects.toBeInstanceOf(ConflictException);
      expect((await prisma.expense.findUniqueOrThrow({ where: { id: second.id } })).status).toBe('APPROVED');
      const refunded = await expenses.refund(expense.id, 'Remboursement fournisseur', admin.id);
      expect(refunded.status).toBe('REFUNDED');
      expect((await treasury.summary(session.id, admin.id)).expected.toString()).toBe('100');
      await expect(expenses.refund(expense.id, 'Double remboursement', admin.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect((await expenses.cancel(second.id, 'Annulation', admin.id)).status).toBe('CANCELLED');
    } finally {
      await prisma.$disconnect();
    }
  }, 30000);
});
