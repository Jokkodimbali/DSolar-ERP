import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MovementType, Prisma, TransferStatus } from '@prisma/client';
import { pageBounds, pageResult, type ListCriteria } from '../../../shared/pagination';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { CreateTransferInput, ReceiveTransferInput, TransferRepository } from '../application/transfers.port';

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => JSON.stringify(key) + ':' + canonicalJson(item)).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
};

const D = (value: string | Prisma.Decimal) => new Prisma.Decimal(value);
const validQuantity = (value: Prisma.Decimal) =>
  value.isFinite() && !value.lt(0) && value.decimalPlaces() <= 3 && value.lt('1000000000000000');
@Injectable()
export class PrismaTransfersRepository implements TransferRepository {
  constructor(private readonly prisma: PrismaService) {}
  private async access(tx: Prisma.TransactionClient, storeId: string, userId: string) {
    const [user, store, access] = await Promise.all([
      tx.user.findUnique({
        where: { id: userId },
        select: { status: true, roles: { where: { role: { code: 'ADMIN' } }, select: { roleId: true } } },
      }),
      tx.store.findUnique({ where: { id: storeId }, select: { status: true } }),
      tx.userStoreAccess.findUnique({ where: { userId_storeId: { userId, storeId } } }),
    ]);
    if (!user || user.status !== 'ACTIVE' || (!access && user.roles.length === 0))
      throw new ForbiddenException('Accès au magasin interdit.');
    if (!store || store.status !== 'ACTIVE') throw new ConflictException('Magasin inexistant ou inactif.');
  }
  private async load(
    tx: Prisma.TransactionClient,
    id: string,
    actorId: string,
    scope: 'origin' | 'destination' | 'both' = 'both',
  ) {
    const transfer = await tx.stockTransfer.findUnique({ where: { id }, include: { lines: true } });
    if (!transfer) throw new NotFoundException('Transfert introuvable.');
    if (scope !== 'destination') await this.access(tx, transfer.originId, actorId);
    if (scope !== 'origin') await this.access(tx, transfer.destinationId, actorId);
    return transfer;
  }
  private async atomic<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 15000,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2)
          continue;
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
          throw new ConflictException('Référence déjà utilisée ou conflit d’unicité.');
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
          throw new ConflictException('Conflit concurrent, veuillez réessayer.');
        throw error;
      }
    }
    throw new ConflictException('Conflit concurrent.');
  }
  private audit(
    tx: Prisma.TransactionClient,
    transfer: { id: string; originId: string; destinationId: string },
    actorId: string,
    action: string,
    payload?: Prisma.InputJsonValue,
  ) {
    return tx.auditLog.create({
      data: {
        actorId,
        action: 'TRANSFER_' + action,
        entityType: 'StockTransfer',
        entityId: transfer.id,
        storeId: transfer.originId,
        payload: {
          originId: transfer.originId,
          destinationId: transfer.destinationId,
          ...(payload ? { details: payload } : {}),
        },
      },
    });
  }

  private event(
    tx: Prisma.TransactionClient,
    transferId: string,
    actorId: string,
    action: string,
    key: string,
    payload?: Prisma.InputJsonValue,
  ) {
    return tx.stockTransferEvent.create({
      data: { transferId, actorId, action, operationKey: key, ...(payload ? { payload } : {}) },
    });
  }
  async create(input: CreateTransferInput) {
    return this.atomic(async (tx) => {
      await this.access(tx, input.originId, input.actorId);
      await this.access(tx, input.destinationId, input.actorId);
      if (input.originId === input.destinationId) {
        throw new ConflictException('Les magasins source et destination doivent être différents.');
      }
      if (input.lines.length === 0 || input.lines.length > 100) {
        throw new ConflictException('Un transfert doit contenir entre 1 et 100 lignes.');
      }
      const productIds = input.lines.map((line) => line.productId);
      if (new Set(productIds).size !== productIds.length) {
        throw new ConflictException('Un produit ne peut apparaître qu’une fois par transfert.');
      }
      if (input.lines.some((line) => !validQuantity(D(line.quantity)) || D(line.quantity).lte(0))) {
        throw new ConflictException('Les quantités transférées doivent être strictement positives.');
      }
      const products = await tx.product.count({
        where: { id: { in: input.lines.map((l) => l.productId) }, active: true },
      });
      if (products !== input.lines.length) throw new ConflictException('Produit inexistant ou inactif.');
      const transfer = await tx.stockTransfer.create({
        data: {
          number: input.number,
          originId: input.originId,
          destinationId: input.destinationId,
          createdById: input.actorId,
          lines: { create: input.lines.map((l) => ({ productId: l.productId, quantity: D(l.quantity) })) },
        },
        include: { lines: true },
      });
      await this.event(tx, transfer.id, input.actorId, 'CREATED', 'TRANSFER_CREATE:' + transfer.id);
      await this.audit(tx, transfer, input.actorId, 'CREATED', { lineCount: transfer.lines.length });
      return transfer;
    });
  }
  list(storeId: string, actorId: string, query: ListCriteria) {
    const { page, limit, skip } = pageBounds(query);
    return this.prisma.$transaction(async (tx) => {
      await this.access(tx, storeId, actorId);
      const search = query.search?.trim();
      const where: Prisma.StockTransferWhereInput = {
        origin: { status: 'ACTIVE' }, destination: { status: 'ACTIVE' },
        OR: [{ originId: storeId }, { destinationId: storeId }],
        ...(search ? { number: { contains: search, mode: 'insensitive' } } : {}),
      };
      const [total, items] = await Promise.all([
        tx.stockTransfer.count({ where }),
        tx.stockTransfer.findMany({
          where, skip, take: limit, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { id: true, number: true, status: true, originId: true, destinationId: true, createdAt: true, origin: { select: { name: true } }, destination: { select: { name: true } } },
        }),
      ]);
      return pageResult(items, total, page, limit);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  get(id: string, actorId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const transfer = await tx.stockTransfer.findFirst({
          where: { id, origin: { status: 'ACTIVE' }, destination: { status: 'ACTIVE' } },
          include: { origin: { select: { name: true } }, destination: { select: { name: true } }, lines: { include: { product: { select: { name: true, sku: true, unit: true } } } }, events: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, action: true, createdAt: true } } },
        });
        if (!transfer) throw new NotFoundException('Transfert introuvable ou magasin inactif.');
        const user = await tx.user.findUnique({
          where: { id: actorId },
          select: { status: true, roles: { where: { role: { code: 'ADMIN' } }, select: { roleId: true } } },
        });
        if (!user || user.status !== 'ACTIVE') throw new ForbiddenException('Compte inactif.');
        if (
          !user.roles.length &&
          !(await tx.userStoreAccess.count({
            where: { userId: actorId, storeId: { in: [transfer.originId, transfer.destinationId] } },
          }))
        )
          throw new ForbiddenException('Accès au transfert non autorisé.');
        return transfer;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async approve(id: string, actorId: string) {
    return this.atomic(async (tx) => {
      const transfer = await this.load(tx, id, actorId, 'origin');
      if (transfer.status === TransferStatus.APPROVED) return transfer;
      if (transfer.status !== TransferStatus.DRAFT) throw new ConflictException('Transition invalide.');
      const updated = await tx.stockTransfer.update({
        where: { id },
        data: { status: TransferStatus.APPROVED, approvedAt: new Date(), approvedById: actorId },
      });
      await this.event(tx, id, actorId, 'APPROVED', 'TRANSFER_APPROVE:' + id);
      await this.audit(tx, transfer, actorId, 'APPROVED');
      return updated;
    });
  }
  async ship(id: string, actorId: string) {
    return this.atomic(async (tx) => {
      const transfer = await this.load(tx, id, actorId, 'origin');
      if (transfer.status === TransferStatus.SHIPPED) return transfer;
      if (transfer.status !== TransferStatus.APPROVED) throw new ConflictException('Transfert non approuvé.');
      if (
        !transfer.lines.length ||
        new Set(transfer.lines.map((line) => line.productId)).size !== transfer.lines.length ||
        transfer.lines.some((line) => !validQuantity(line.quantity) || line.quantity.lte(0))
      )
        throw new ConflictException('Lignes du transfert incohérentes.');
      for (const line of [...transfer.lines].sort((a, b) => a.productId.localeCompare(b.productId))) {
        await tx.storeStock.upsert({
          where: { storeId_productId: { storeId: transfer.originId, productId: line.productId } },
          create: {
            storeId: transfer.originId,
            productId: line.productId,
            quantity: D('0'),
            reserved: D('0'),
          },
          update: {},
        });
        // The update and reservation check are in one serializable transaction; rollback is atomic.
        const current = await tx.storeStock.findUniqueOrThrow({
          where: { storeId_productId: { storeId: transfer.originId, productId: line.productId } },
        });
        if (current.quantity.minus(current.reserved).lessThan(line.quantity))
          throw new ConflictException('Stock libre insuffisant : réservation existante.');
        const changed = await tx.storeStock.updateMany({
          where: {
            storeId: transfer.originId,
            productId: line.productId,
            quantity: current.quantity,
            reserved: current.reserved,
          },
          data: { quantity: { decrement: line.quantity } },
        });
        if (changed.count !== 1) throw new ConflictException('Conflit concurrent sur le stock source.');
        await tx.stockMovement.create({
          data: {
            storeId: transfer.originId,
            productId: line.productId,
            quantity: line.quantity.negated(),
            type: MovementType.TRANSFER_OUT,
            referenceType: 'STOCK_TRANSFER',
            referenceId: id,
            operationKey: 'TRANSFER_OUT:' + line.id,
            actorId,
            reason: 'Expédition transfert ' + transfer.number,
          },
        });
      }
      const updated = await tx.stockTransfer.update({
        where: { id },
        data: { status: TransferStatus.SHIPPED, shippedAt: new Date(), shippedById: actorId },
      });
      await this.event(tx, id, actorId, 'SHIPPED', 'TRANSFER_SHIP:' + id);
      await this.audit(tx, transfer, actorId, 'SHIPPED', {
        lines: transfer.lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity.toString(),
        })),
      });
      return updated;
    });
  }
  async receive(input: ReceiveTransferInput) {
    return this.atomic(async (tx) => {
      const { id, actorId, operationKey } = input;
      const transfer = await this.load(tx, id, actorId, 'destination');
      if (
        !input.lines.length ||
        input.lines.length > 100 ||
        new Set(input.lines.map((line) => line.lineId)).size !== input.lines.length
      )
        throw new ConflictException('Lignes de réception absentes, trop nombreuses ou dupliquées.');
      const payload = JSON.stringify({
        lines: [...input.lines].sort((a, b) => a.lineId.localeCompare(b.lineId)),
        finalize: input.finalize,
      });
      const prior = await tx.stockTransferEvent.findUnique({ where: { operationKey } });
      if (prior) {
        if (
          prior.transferId !== id ||
          prior.action !== 'RECEIPT' ||
          prior.actorId !== actorId ||
          canonicalJson(prior.payload) !== canonicalJson(JSON.parse(payload))
        )
          throw new ConflictException('Clé d’idempotence réutilisée avec un contenu différent.');
        return transfer;
      }
      if (transfer.status !== TransferStatus.SHIPPED)
        throw new ConflictException('Réception impossible dans cet état.');
      if (
        !transfer.lines.length ||
        new Set(transfer.lines.map((line) => line.productId)).size !== transfer.lines.length ||
        transfer.lines.some(
          (line) =>
            !validQuantity(line.quantity) ||
            line.quantity.lte(0) ||
            ![line.receivedQuantity, line.damagedQuantity, line.missingQuantity].every(validQuantity) ||
            line.receivedQuantity.plus(line.damagedQuantity).plus(line.missingQuantity).gt(line.quantity),
        )
      )
        throw new ConflictException('Historique des quantités du transfert incohérent.');
      const byId = new Map(transfer.lines.map((line) => [line.id, line]));
      for (const line of [...input.lines].sort((a, b) => {
        const left = byId.get(a.lineId)?.productId ?? a.lineId;
        const right = byId.get(b.lineId)?.productId ?? b.lineId;
        return left.localeCompare(right);
      })) {
        const current = byId.get(line.lineId);
        if (!current) throw new ConflictException('Ligne étrangère au transfert.');
        const good = D(line.received),
          damaged = D(line.damaged),
          missing = D(line.missing);
        if ([good, damaged, missing].some((quantity) => !validQuantity(quantity)))
          throw new ConflictException(
            'Les quantités reçues, endommagées ou manquantes doivent être positives ou nulles.',
          );
        const total = good.plus(damaged).plus(missing);
        if (total.isZero()) throw new ConflictException('Quantité de réception nulle.');
        const remaining = current.quantity
          .minus(current.receivedQuantity)
          .minus(current.damagedQuantity)
          .minus(current.missingQuantity);
        if (total.greaterThan(remaining))
          throw new ConflictException('Réception supérieure au restant à traiter.');
        if (good.greaterThan(0)) {
          await tx.storeStock.upsert({
            where: { storeId_productId: { storeId: transfer.destinationId, productId: current.productId } },
            create: {
              storeId: transfer.destinationId,
              productId: current.productId,
              quantity: good,
              reserved: D('0'),
            },
            update: { quantity: { increment: good } },
          });
          await tx.stockMovement.create({
            data: {
              storeId: transfer.destinationId,
              productId: current.productId,
              quantity: good,
              type: MovementType.TRANSFER_IN,
              referenceType: 'STOCK_TRANSFER',
              referenceId: id,
              operationKey: 'TRANSFER_RECEIPT:' + operationKey + ':' + current.id,
              actorId,
              reason: 'Réception transfert ' + transfer.number,
            },
          });
        }
        await tx.stockTransferLine.update({
          where: { id: current.id },
          data: {
            receivedQuantity: { increment: good },
            damagedQuantity: { increment: damaged },
            missingQuantity: { increment: missing },
          },
        });
      }
      await this.event(
        tx,
        id,
        actorId,
        'RECEIPT',
        operationKey,
        JSON.parse(payload) as Prisma.InputJsonValue,
      );
      await this.audit(tx, transfer, actorId, 'RECEIPT', {
        operationKey,
        lineCount: input.lines.length,
        finalize: input.finalize,
      });
      const lines = await tx.stockTransferLine.findMany({ where: { transferId: id } });
      const accounted = lines.every((l) =>
        l.receivedQuantity.plus(l.damagedQuantity).plus(l.missingQuantity).equals(l.quantity),
      );
      if (input.finalize && !accounted)
        throw new ConflictException('Toutes les quantités doivent être comptabilisées avant clôture.');
      if (accounted) {
        const discrepancy = lines.some(
          (l) => l.damagedQuantity.greaterThan(0) || l.missingQuantity.greaterThan(0),
        );
        await tx.stockTransfer.update({
          where: { id },
          data: {
            status: discrepancy ? TransferStatus.CLOSED_WITH_DISCREPANCY : TransferStatus.RECEIVED,
            receivedAt: new Date(),
            receivedById: actorId,
            closedAt: new Date(),
            closedById: actorId,
          },
        });
        await this.event(
          tx,
          id,
          actorId,
          discrepancy ? 'CLOSED_WITH_DISCREPANCY' : 'RECEIVED',
          'TRANSFER_CLOSE:' + id,
        );
        await this.audit(tx, transfer, actorId, discrepancy ? 'CLOSED_WITH_DISCREPANCY' : 'RECEIVED');
      }
      return tx.stockTransfer.findUniqueOrThrow({
        where: { id },
        include: { lines: true, events: { orderBy: { createdAt: 'asc' } } },
      });
    });
  }
  async cancel(id: string, actorId: string) {
    return this.atomic(async (tx) => {
      const transfer = await this.load(tx, id, actorId, 'origin');
      if (transfer.status === TransferStatus.CANCELLED) return transfer;
      if (transfer.status !== TransferStatus.DRAFT && transfer.status !== TransferStatus.APPROVED)
        throw new ConflictException('Un transfert expédié ne peut pas être annulé.');
      const updated = await tx.stockTransfer.update({
        where: { id },
        data: { status: TransferStatus.CANCELLED, cancelledAt: new Date(), cancelledById: actorId },
      });
      await this.event(tx, id, actorId, 'CANCELLED', 'TRANSFER_CANCEL:' + id);
      await this.audit(tx, transfer, actorId, 'CANCELLED');
      return updated;
    });
  }
}
