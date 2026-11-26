const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL].map((value) => new URL(value || 'invalid:'));
  if (process.env.NODE_ENV !== 'test' || urls.some((url) =>
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.pathname !== '/dsolar_test' || url.username !== 'dsolar_runtime_test')) {
    throw new Error('A dedicated restricted local test database is required.');
  }
  const prisma = new PrismaClient();
  try {
    const [identity] = await prisma.$queryRaw`SELECT current_user AS role`;
    assert.equal(identity.role, 'dsolar_runtime_test');
    const actor = await prisma.user.findFirstOrThrow({
      where: { status: 'ACTIVE', roles: { some: { role: { code: 'ADMIN' } } } },
    });
    const suffix = randomUUID().slice(0, 8);
    const account = await prisma.ledgerAccount.create({ data: { code: 'RT-A-' + suffix, name: 'Runtime asset' } });
    const counterpart = await prisma.ledgerAccount.create({ data: { code: 'RT-B-' + suffix, name: 'Runtime equity' } });
    await prisma.ledgerAccountClassification.create({ data: { accountId: account.id, category: 'ASSET', classifiedBy: actor.id } });
    const journal = await prisma.ledgerJournal.create({ data: { code: 'RT-' + suffix, name: 'Runtime journal' } });
    const period = await prisma.ledgerPeriod.create({
      data: { name: 'Runtime test ' + suffix, startsAt: new Date('2199-01-01'), endsAt: new Date('2199-12-31') },
    });
    const entry = await prisma.ledgerEntry.create({
      data: {
        actorId: actor.id, periodId: period.id, journalId: journal.id, date: new Date('2199-01-01'),
        description: 'Runtime posting', operationKey: randomUUID(),
        lines: { create: [
          { accountId: account.id, debit: '12.34', credit: '0' },
          { accountId: counterpart.id, debit: '0', credit: '12.34' },
        ] },
      }, include: { lines: true },
    });
    await prisma.ledgerEntry.update({ where: { id: entry.id }, data: { postedAt: new Date() } });
    const event = await prisma.auditLog.create({ data: {
      actorId: actor.id, action: 'RUNTIME_ROLE_SMOKE', entityType: 'LedgerEntry', entityId: entry.id,
    } });
    assert.equal(await prisma.auditLog.count({ where: { id: event.id } }), 1);
    await assert.rejects(prisma.auditLog.update({ where: { id: event.id }, data: { action: 'TAMPERED' } }));
    await assert.rejects(prisma.auditLog.delete({ where: { id: event.id } }));
    await assert.rejects(prisma.ledgerLine.update({ where: { id: entry.lines[0].id }, data: { debit: '1' } }));
    await assert.rejects(prisma.ledgerEntry.update({ where: { id: entry.id }, data: { description: 'TAMPERED' } }));
    await assert.rejects(prisma.$executeRaw`TRUNCATE TABLE "AuditLog"`);
    await assert.rejects(prisma.$executeRaw`ALTER TABLE "AuditLog" DISABLE TRIGGER ALL`);
    await assert.rejects(prisma.$executeRaw`CREATE TABLE public.runtime_forbidden (id integer)`);
    await assert.rejects(prisma.$executeRaw`CREATE TEMP TABLE runtime_forbidden (id integer)`);
    await assert.rejects(prisma.$executeRaw`SET ROLE dsolar_test`);
    await assert.rejects(prisma.$queryRaw`SELECT * FROM "_prisma_migrations"`);
    await assert.rejects(prisma.$executeRaw`UPDATE "Role" SET name = name WHERE code = 'ADMIN'`);
    await prisma.$queryRaw`SELECT count(*) FROM "LedgerPendingSource"`;
    assert.equal((await prisma.auditLog.findUniqueOrThrow({ where: { id: event.id } })).action, 'RUNTIME_ROLE_SMOKE');
    console.log('PASS restricted PostgreSQL runtime: posting, audit append, prohibited DDL, role escalation and mutation');
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
