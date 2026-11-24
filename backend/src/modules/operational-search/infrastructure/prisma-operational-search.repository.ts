import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  ExpenseStatus,
  MovementType,
  Prisma,
  StoreStatus,
  SupplierReturnStatus,
  TransferStatus,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { pageBounds, pageResult } from '../../../shared/pagination';
import {
  OperationalCriteria,
  OperationalKind,
  OperationalSearchPort,
} from '../application/operational-search.port';

@Injectable()
export class PrismaOperationalSearchRepository implements OperationalSearchPort {
  constructor(private readonly prisma: PrismaService) {}

  search(kind: OperationalKind, actorId: string, query: OperationalCriteria) {
    const { page, limit, skip } = pageBounds(query);
    const search = query.search?.trim();
    const contains = search ? { contains: search, mode: 'insensitive' as const } : undefined;
    const pageOptions = { skip, take: limit };
    return this.prisma.$transaction(
      async (tx) => {
        const actor = await tx.user.findFirst({
          where: { id: actorId, status: 'ACTIVE' },
          select: {
            roles: { select: { role: { select: { code: true } } } },
            stores: { select: { storeId: true } },
          },
        });
        if (!actor) throw new ForbiddenException('Utilisateur inactif.');
        const admin = actor.roles.some((row) => row.role.code === 'ADMIN');
        if (!admin && !actor.roles.some((row) => row.role.code === 'MAGASINIER'))
          throw new ForbiddenException('Rôle interne requis.');
        if (
          [
            'users',
            'expenses',
            'returns',
            'registers',
            'entries',
            'bank-statements',
            'accounts',
            'journals',
            'periods',
            'bank-accounts',
            'cash-sessions',
            'cash-movements',
            'bank-lines',
          ].includes(kind) &&
          !admin
        )
          throw new ForbiddenException('Cette liste est réservée au super administrateur.');
        const activeStore: Prisma.StoreWhereInput = {
          status: 'ACTIVE',
          ...(admin ? {} : { id: { in: actor.stores.map((row) => row.storeId) } }),
        };
        if (kind === 'stores') {
          const where: Prisma.StoreWhereInput = {
            AND: [
              admin ? {} : activeStore,
              { id: query.storeId, status: query.status as StoreStatus | undefined },
              ...(contains ? [{ OR: [{ name: contains }, { code: contains }, { address: contains }] }] : []),
            ],
          };
          const [items, total] = await Promise.all([
            tx.store.findMany({ where, ...pageOptions, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
            tx.store.count({ where }),
          ]);
          return pageResult(items, total, page, limit);
        }
        if (kind === 'users') {
          const where: Prisma.UserWhereInput = {
            status: query.status as UserStatus | undefined,
            ...(contains ? { OR: [{ fullName: contains }, { email: contains }] } : {}),
          };
          const [items, total] = await Promise.all([
            tx.user.findMany({
              where,
              ...pageOptions,
              orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                email: true,
                fullName: true,
                status: true,
                createdAt: true,
                roles: { select: { role: { select: { code: true, name: true } } } },
                stores: { select: { storeId: true } },
              },
            }),
            tx.user.count({ where }),
          ]);
          return pageResult(items, total, page, limit);
        }
        if (kind === 'stocks') {
          const where: Prisma.StoreStockWhereInput = {
            storeId: query.storeId,
            productId: query.productId,
            store: activeStore,
            product: {
              active: true,
              ...(contains ? { OR: [{ sku: contains }, { name: contains }] } : {}),
            },
          };
          const [rows, total] = await Promise.all([
            tx.storeStock.findMany({
              where,
              ...pageOptions,
              orderBy: [{ product: { name: 'asc' } }, { id: 'asc' }],
              select: {
                id: true,
                storeId: true,
                productId: true,
                quantity: true,
                reserved: true,
                product: { select: { sku: true, name: true, unit: true } },
              },
            }),
            tx.storeStock.count({ where }),
          ]);
          return pageResult(
            rows.map((row) => ({
              ...row,
              quantity: row.quantity.toFixed(3),
              reserved: row.reserved.toFixed(3),
              available: row.quantity.minus(row.reserved).toFixed(3),
            })),
            total,
            page,
            limit,
          );
        }
        if (kind === 'transfers') {
          const where: Prisma.StockTransferWhereInput = {
            AND: [
              {
                origin: { status: 'ACTIVE' },
                destination: { status: 'ACTIVE' },
                status: query.status as TransferStatus | undefined,
                OR: [{ origin: activeStore }, { destination: activeStore }],
              },
              ...(query.storeId
                ? [{ OR: [{ originId: query.storeId }, { destinationId: query.storeId }] }]
                : []),
              ...(contains
                ? [
                    {
                      OR: [
                        { number: contains },
                        { origin: { name: contains } },
                        { destination: { name: contains } },
                      ],
                    },
                  ]
                : []),
            ],
          };
          const [items, total] = await Promise.all([
            tx.stockTransfer.findMany({
              where,
              ...pageOptions,
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              include: { lines: true },
            }),
            tx.stockTransfer.count({ where }),
          ]);
          return pageResult(items, total, page, limit);
        }
        if (kind === 'counts') {
          const where: Prisma.InventorySessionWhereInput = {
            storeId: query.storeId,
            status: query.status,
            AND: [
              { store: activeStore },
              ...(contains ? [{ store: { OR: [{ name: contains }, { code: contains }] } }] : []),
            ],
          };
          const [items, total] = await Promise.all([
            tx.inventorySession.findMany({
              where,
              ...pageOptions,
              orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
              include: { _count: { select: { lines: true } } },
            }),
            tx.inventorySession.count({ where }),
          ]);
          return pageResult(items, total, page, limit);
        }
        if (kind === 'expenses') {
          const where: Prisma.ExpenseWhereInput = {
            storeId: query.storeId,
            status: query.status as ExpenseStatus | undefined,
            ...(contains
              ? { OR: [{ description: contains }, { reference: contains }, { category: { name: contains } }] }
              : {}),
          };
          const [items, total] = await Promise.all([
            tx.expense.findMany({
              where,
              ...pageOptions,
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              include: { category: true },
            }),
            tx.expense.count({ where }),
          ]);
          return pageResult(items, total, page, limit);
        }
        if (kind === 'returns') {
          const where: Prisma.SupplierReturnWhereInput = {
            receipt: { storeId: query.storeId },
            status: query.status as SupplierReturnStatus | undefined,
            ...(contains ? { OR: [{ reason: contains }, { receipt: { number: contains } }] } : {}),
          };
          const [items, total] = await Promise.all([
            tx.supplierReturn.findMany({
              where,
              ...pageOptions,
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              include: { credit: true },
            }),
            tx.supplierReturn.count({ where }),
          ]);
          return pageResult(items, total, page, limit);
        }
        if (kind === 'registers') {
          const where: Prisma.CashRegisterWhereInput = {
            storeId: query.storeId,
            ...(contains ? { OR: [{ name: contains }, { store: { name: contains } }] } : {}),
          };
          const [items, total] = await Promise.all([
            tx.cashRegister.findMany({
              where,
              ...pageOptions,
              orderBy: [{ name: 'asc' }, { id: 'asc' }],
              include: { sessions: { where: { closedAt: null }, take: 1 } },
            }),
            tx.cashRegister.count({ where }),
          ]);
          return pageResult(items, total, page, limit);
        }
        if (kind === 'entries') {
          const where: Prisma.LedgerEntryWhereInput = {
            periodId: query.periodId,
            ...(query.status ? { postedAt: query.status === 'POSTED' ? { not: null } : null } : {}),
            ...(contains
              ? {
                  OR: [
                    { description: contains },
                    { journal: { code: contains } },
                    { journal: { name: contains } },
                  ],
                }
              : {}),
          };
          const [items, total] = await Promise.all([
            tx.ledgerEntry.findMany({
              where,
              ...pageOptions,
              orderBy: [{ date: 'desc' }, { id: 'desc' }],
              include: { lines: true },
            }),
            tx.ledgerEntry.count({ where }),
          ]);
          return pageResult(items, total, page, limit);
        }
        if (kind === 'categories') {
          const where: Prisma.CategoryWhereInput = contains
            ? { OR: [{ name: contains }, { code: contains }] }
            : {};
          const [items, total] = await Promise.all([
            tx.category.findMany({ where, ...pageOptions, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
            tx.category.count({ where }),
          ]);
          return pageResult(items, total, page, limit);
        }
        if (kind === 'brands') {
          const where: Prisma.BrandWhereInput = contains ? { name: contains } : {};
          const [items, total] = await Promise.all([
            tx.brand.findMany({ where, ...pageOptions, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
            tx.brand.count({ where }),
          ]);
          return pageResult(items, total, page, limit);
        }
        if (kind === 'tax-regimes') {
          const where: Prisma.TaxRegimeWhereInput = contains
            ? { OR: [{ name: contains }, { code: contains }, { legalBasis: contains }] }
            : {};
          const [items, total] = await Promise.all([
            tx.taxRegime.findMany({ where, ...pageOptions, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
            tx.taxRegime.count({ where }),
          ]);
          return pageResult(items, total, page, limit);
        }
        if (kind === 'accounts') {
          const where: Prisma.LedgerAccountWhereInput = contains
            ? { OR: [{ code: contains }, { name: contains }] }
            : {};
          const [items, total] = await Promise.all([
            tx.ledgerAccount.findMany({ where, ...pageOptions, orderBy: [{ code: 'asc' }, { id: 'asc' }] }),
            tx.ledgerAccount.count({ where }),
          ]);
          return pageResult(items, total, page, limit);
        }
        if (kind === 'journals') {
          const where: Prisma.LedgerJournalWhereInput = contains
            ? { OR: [{ code: contains }, { name: contains }] }
            : {};
          const [items, total] = await Promise.all([
            tx.ledgerJournal.findMany({ where, ...pageOptions, orderBy: [{ code: 'asc' }, { id: 'asc' }] }),
            tx.ledgerJournal.count({ where }),
          ]);
          return pageResult(items, total, page, limit);
        }
        if (kind === 'bank-accounts') {
          const where: Prisma.LedgerBankAccountWhereInput = contains
            ? { OR: [{ name: contains }, { account: { code: contains } }] }
            : {};
          const [items, total] = await Promise.all([
            tx.ledgerBankAccount.findMany({
              where,
              ...pageOptions,
              orderBy: [{ name: 'asc' }, { id: 'asc' }],
            }),
            tx.ledgerBankAccount.count({ where }),
          ]);
          return pageResult(items, total, page, limit);
        }
        if (kind === 'price-history') {
          const where: Prisma.ProductPriceWhereInput = {
            productId: query.productId,
            ...(query.status ? { validTo: query.status === 'ACTIVE' ? null : { not: null } } : {}),
            ...(contains ? { product: { OR: [{ name: contains }, { sku: contains }] } } : {}),
          };
          const [items, total] = await Promise.all([
            tx.productPrice.findMany({
              where,
              ...pageOptions,
              orderBy: [{ validFrom: 'desc' }, { id: 'desc' }],
            }),
            tx.productPrice.count({ where }),
          ]);
          return pageResult(items, total, page, limit);
        }
        if (kind === 'stock-movements') {
          const where: Prisma.StockMovementWhereInput = {
            storeId: query.storeId,
            store: activeStore,
            productId: query.productId,
            type: query.status as MovementType | undefined,
            ...(contains
              ? {
                  OR: [{ reason: contains }, { product: { name: contains } }, { product: { sku: contains } }],
                }
              : {}),
          };
          const [items, total] = await Promise.all([
            tx.stockMovement.findMany({
              where,
              ...pageOptions,
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            }),
            tx.stockMovement.count({ where }),
          ]);
          return pageResult(items, total, page, limit);
        }
        if (kind === 'periods') {
          const where: Prisma.LedgerPeriodWhereInput = {
            ...(query.status ? { closedAt: query.status === 'OPEN' ? null : { not: null } } : {}),
            ...(contains ? { name: contains } : {}),
          };
          const [items, total] = await Promise.all([
            tx.ledgerPeriod.findMany({
              where,
              ...pageOptions,
              orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
            }),
            tx.ledgerPeriod.count({ where }),
          ]);
          return pageResult(items, total, page, limit);
        }
        if (kind === 'cash-sessions') {
          const where: Prisma.CashSessionWhereInput = {
            registerId: query.registerId,
            register: { storeId: query.storeId },
            ...(query.status ? { closedAt: query.status === 'OPEN' ? null : { not: null } } : {}),
            ...(contains ? { register: { storeId: query.storeId, name: contains } } : {}),
          };
          const [items, total] = await Promise.all([
            tx.cashSession.findMany({
              where,
              ...pageOptions,
              orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
            }),
            tx.cashSession.count({ where }),
          ]);
          return pageResult(items, total, page, limit);
        }
        if (kind === 'cash-movements') {
          const where: Prisma.CashMovementWhereInput = {
            sessionId: query.sessionId,
            session: { registerId: query.registerId, register: { storeId: query.storeId } },
            ...(contains ? { reason: contains } : {}),
          };
          const [items, total] = await Promise.all([
            tx.cashMovement.findMany({
              where,
              ...pageOptions,
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            }),
            tx.cashMovement.count({ where }),
          ]);
          return pageResult(items, total, page, limit);
        }
        if (kind === 'bank-lines') {
          const where: Prisma.LedgerBankLineWhereInput = {
            statementId: query.statementId,
            ...(query.status ? { ledgerLineId: query.status === 'MATCHED' ? { not: null } : null } : {}),
            ...(contains ? { OR: [{ description: contains }, { reference: contains }] } : {}),
          };
          const [items, total] = await Promise.all([
            tx.ledgerBankLine.findMany({
              where,
              ...pageOptions,
              orderBy: [{ date: 'desc' }, { id: 'desc' }],
            }),
            tx.ledgerBankLine.count({ where }),
          ]);
          return pageResult(items, total, page, limit);
        }
        const where: Prisma.LedgerBankStatementWhereInput = {
          ...(query.status ? { closedAt: query.status === 'CLOSED' ? { not: null } : null } : {}),
          ...(contains ? { OR: [{ reference: contains }, { bankAccount: { name: contains } }] } : {}),
        };
        const [items, total] = await Promise.all([
          tx.ledgerBankStatement.findMany({
            where,
            ...pageOptions,
            orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
            include: { _count: { select: { lines: true } } },
          }),
          tx.ledgerBankStatement.count({ where }),
        ]);
        return pageResult(items, total, page, limit);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
