import { Injectable } from '@nestjs/common';
import { DocumentStatus, InvoiceStatus, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { pageBounds, pageResult } from '../../../shared/pagination';
import {
  CommercialCriteria,
  CommercialKind,
  CommercialSearchPort,
} from '../application/commercial-search.port';

@Injectable()
export class PrismaCommercialSearchRepository implements CommercialSearchPort {
  constructor(private readonly prisma: PrismaService) {}

  search(kind: CommercialKind, actorId: string, query: CommercialCriteria) {
    const { page, limit, skip } = pageBounds(query);
    const search = query.search?.trim();
    const contains = search ? { contains: search, mode: 'insensitive' as const } : undefined;
    return this.prisma.$transaction(
      async (tx) => {
        if (kind === 'customers') {
          const where: Prisma.CustomerWhereInput = contains
            ? { OR: [{ name: contains }, { taxId: contains }, { email: contains }, { phone: contains }] }
            : {};
          const [items, total] = await Promise.all([
            tx.customer.findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip, take: limit }),
            tx.customer.count({ where }),
          ]);
          return pageResult(items, total, page, limit);
        }
        const visible = {
          lines: {
            some: query.storeId ? { storeId: query.storeId } : {},
            every: {
              store: {
                status: 'ACTIVE' as const,
                userAccess: { some: { userId: actorId, user: { status: 'ACTIVE' as const } } },
              },
            },
          },
        };
        const common = {
          customerId: query.customerId,
          ...(contains ? { OR: [{ number: contains }, { customer: { name: contains } }] } : {}),
        };
        if (kind === 'proformas') {
          const stores = await tx.userStoreAccess.findMany({
            where: { userId: actorId, user: { status: 'ACTIVE' }, store: { status: 'ACTIVE' } },
            select: { storeId: true },
          });
          const ids = stores.map((row) => row.storeId);
          const now = new Date();
          const expiry: Prisma.ProformaWhereInput = { status: 'ISSUED', expiresAt: { lte: now } };
          const status: Prisma.ProformaWhereInput =
            query.status === 'EXPIRED'
              ? { OR: [{ status: 'EXPIRED' }, expiry] }
              : query.status === 'ISSUED'
                ? { status: 'ISSUED', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }
                : { status: query.status as DocumentStatus | undefined };
          const where: Prisma.ProformaWhereInput = {
            AND: [
              common,
              status,
              {
                lines: {
                  some: query.storeId ? { storeId: query.storeId } : {},
                  every: { storeId: { in: ids } },
                },
              },
            ],
          };
          const [items, total] = await Promise.all([
            tx.proforma.findMany({
              where,
              include: { lines: true },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              skip,
              take: limit,
            }),
            tx.proforma.count({ where }),
          ]);
          return pageResult(
            items.map((item) => ({
              ...item,
              status:
                item.status === 'ISSUED' && item.expiresAt && item.expiresAt <= now ? 'EXPIRED' : item.status,
            })),
            total,
            page,
            limit,
          );
        }
        if (kind === 'orders') {
          const where: Prisma.SalesOrderWhereInput = {
            ...common,
            ...visible,
            status: query.status as OrderStatus | undefined,
          };
          const [items, total] = await Promise.all([
            tx.salesOrder.findMany({
              where,
              include: { lines: true },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              skip,
              take: limit,
            }),
            tx.salesOrder.count({ where }),
          ]);
          return pageResult(items, total, page, limit);
        }
        const where: Prisma.InvoiceWhereInput = {
          ...common,
          order: visible,
          status: query.status as InvoiceStatus | undefined,
        };
        const [items, total] = await Promise.all([
          tx.invoice.findMany({
            where,
            include: { lines: true },
            orderBy: [{ number: 'desc' }, { id: 'desc' }],
            skip,
            take: limit,
          }),
          tx.invoice.count({ where }),
        ]);
        return pageResult(items, total, page, limit);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
