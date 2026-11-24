import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma, ReceiptStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { pageBounds, pageResult } from '../../../shared/pagination';
import {
  ProcurementCriteria,
  ProcurementKind,
  ProcurementSearchPort,
} from '../application/procurement-search.port';

@Injectable()
export class PrismaProcurementSearchRepository implements ProcurementSearchPort {
  constructor(private readonly prisma: PrismaService) {}
  search(kind: ProcurementKind, actorId: string, query: ProcurementCriteria) {
    const { page, limit, skip } = pageBounds(query);
    const search = query.search?.trim();
    const contains = search ? { contains: search, mode: 'insensitive' as const } : undefined;
    return this.prisma.$transaction(
      async (tx) => {
        if (kind === 'suppliers') {
          const where: Prisma.SupplierWhereInput = {
            active: query.active,
            ...(contains
              ? { OR: [{ name: contains }, { email: contains }, { phone: contains }, { taxId: contains }] }
              : {}),
          };
          const [items, total] = await Promise.all([
            tx.supplier.findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip, take: limit }),
            tx.supplier.count({ where }),
          ]);
          return pageResult(items, total, page, limit);
        }
        if (kind === 'purchase-orders') {
          const where: Prisma.PurchaseOrderWhereInput = {
            supplierId: query.supplierId,
            status: query.status as OrderStatus | undefined,
            ...(contains ? { OR: [{ number: contains }, { supplier: { name: contains } }] } : {}),
          };
          const [items, total] = await Promise.all([
            tx.purchaseOrder.findMany({
              where,
              include: { supplier: true, lines: true },
              orderBy: [{ number: 'desc' }, { id: 'desc' }],
              skip,
              take: limit,
            }),
            tx.purchaseOrder.count({ where }),
          ]);
          return pageResult(items, total, page, limit);
        }
        const admin = await tx.user.findFirst({
          where: { id: actorId, status: 'ACTIVE', roles: { some: { role: { code: 'ADMIN' } } } },
          select: { id: true },
        });
        const storeScope: Prisma.StoreWhereInput = admin
          ? { status: 'ACTIVE' }
          : { status: 'ACTIVE', userAccess: { some: { userId: actorId, user: { status: 'ACTIVE' } } } };
        const where: Prisma.GoodsReceiptWhereInput = {
          storeId: query.storeId,
          store: storeScope,
          status: query.status as ReceiptStatus | undefined,
          ...(query.supplierId ? { purchaseOrder: { supplierId: query.supplierId } } : {}),
          ...(contains
            ? { OR: [{ number: contains }, { purchaseOrder: { supplier: { name: contains } } }] }
            : {}),
        };
        const [items, total] = await Promise.all([
          tx.goodsReceipt.findMany({
            where,
            include: { lines: true },
            orderBy: [{ number: 'desc' }, { id: 'desc' }],
            skip,
            take: limit,
          }),
          tx.goodsReceipt.count({ where }),
        ]);
        return pageResult(items, total, page, limit);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
