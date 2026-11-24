import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { ReturnInput, SupplierReturnsPort } from '../application/supplier-returns.port';
import { validReturnQuantity } from '../domain/return-policy';

@Injectable()
export class SupplierReturnsRepository implements SupplierReturnsPort {
  constructor(private readonly prisma: PrismaService) {}

  private async transaction<T>(actor: string, work: (tx: Prisma.TransactionClient) => Promise<T>) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const user = await tx.user.findFirst({
            where: { id: actor, status: 'ACTIVE', roles: { some: { role: { code: 'ADMIN' } } } },
          });
          if (!user) throw new ForbiddenException('Accès retours fournisseurs interdit.');
          return work(tx);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code))
        throw new ConflictException('Opération concurrente ou déjà enregistrée.');
      throw error;
    }
  }

  private async audit(
    tx: Prisma.TransactionClient,
    actorId: string,
    action: string,
    entityId: string,
    storeId: string,
  ) {
    await tx.auditLog.create({ data: { actorId, action, entityId, storeId, entityType: 'SupplierReturn' } });
  }

  private async load(tx: Prisma.TransactionClient, id: string) {
    const result = await tx.supplierReturn.findUnique({
      where: { id },
      include: {
        lines: { include: { receiptLine: true, serials: { include: { serial: true } } } },
        receipt: true,
        credit: true,
      },
    });
    if (!result) throw new NotFoundException('Retour introuvable.');
    return result;
  }

  list(actor: string, storeId?: string) {
    return this.transaction(actor, (tx) =>
      tx.supplierReturn.findMany({
        where: { receipt: { storeId } },
        include: { lines: { include: { serials: true } }, credit: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 200,
      }),
    );
  }

  get(id: string, actor: string) {
    return this.transaction(actor, (tx) => this.load(tx, id));
  }

  registerSerials(receiptLineId: string, serials: string[], actor: string) {
    return this.transaction(actor, async (tx) => {
      if (
        !serials.length ||
        serials.length > 100 ||
        new Set(serials).size !== serials.length ||
        serials.some((serial) => typeof serial !== 'string' || !serial.trim() || serial !== serial.trim() || serial.length > 150)
      )
        throw new ConflictException('Numéros de série invalides.');
      const line = await tx.goodsReceiptLine.findUnique({
        where: { id: receiptLineId },
        include: { receipt: { include: { store: true } } },
      });
      if (!line || line.receipt.status !== 'CONFIRMED' || line.receipt.store.status !== 'ACTIVE')
        throw new ConflictException('Réception confirmée et magasin actif requis.');
      const returned = await tx.supplierReturnLine.count({
        where: { receiptLineId, supplierReturn: { status: 'CONFIRMED' } },
      });
      if (returned) throw new ConflictException('Enregistrement après retour interdit.');
      const registered = await tx.serialNumber.count({ where: { receiptLineId } });
      if (!line.quantity.isInteger() || line.quantity.lt(registered + serials.length))
        throw new ConflictException('Nombre de séries supérieur à la quantité réceptionnée.');
      const stock = await tx.storeStock.findUnique({
        where: { storeId_productId: { storeId: line.receipt.storeId, productId: line.productId } },
      });
      const availableSerials = await tx.serialNumber.count({
        where: { productId: line.productId, currentStoreId: line.receipt.storeId, status: 'AVAILABLE' },
      });
      if (!stock || stock.quantity.minus(stock.reserved).lt(availableSerials + serials.length))
        throw new ConflictException('Stock physique disponible insuffisant.');
      const created = await tx.serialNumber.createMany({
        data: serials.map((serial) => ({
          serial,
          receiptLineId,
          productId: line.productId,
          currentStoreId: line.receipt.storeId,
        })),
      });
      await this.audit(tx, actor, 'RECEIPT_SERIALS_REGISTERED', receiptLineId, line.receipt.storeId);
      return {
        count: created.count,
        serials: await tx.serialNumber.findMany({ where: { serial: { in: serials } } }),
      };
    });
  }

  create(input: ReturnInput, actor: string) {
    return this.transaction(actor, async (tx) => {
      if (
        !input.lines.length ||
        input.lines.length > 100 ||
        new Set(input.lines.map((line) => line.receiptLineId)).size !== input.lines.length ||
        input.lines.some(
          (line) =>
            !validReturnQuantity(line.quantity) ||
            (line.serialIds !== undefined &&
              (line.serialIds.length > 100 || new Set(line.serialIds).size !== line.serialIds.length)),
        )
      )
        throw new ConflictException('Lignes invalides.');
      const existing = await tx.supplierReturn.findUnique({
        where: { operationKey: input.operationKey },
        include: { lines: { include: { serials: true } } },
      });
      if (existing) {
        if (
          existing.createdBy !== actor ||
          existing.receiptId !== input.receiptId ||
          existing.reason !== input.reason ||
          existing.lines.length !== input.lines.length ||
          input.lines.some(
            (line) =>
              !existing.lines.some(
                (old) =>
                  old.receiptLineId === line.receiptLineId &&
                  old.quantity.eq(line.quantity) &&
                  old.serials.length === (line.serialIds?.length ?? 0) &&
                  old.serials.every((serial) => line.serialIds?.includes(serial.serialId)),
              ),
          )
        )
          throw new ConflictException('Clé opération déjà utilisée.');
        return existing;
      }
      const receipt = await tx.goodsReceipt.findUnique({
        where: { id: input.receiptId },
        include: { lines: true, store: true },
      });
      if (
        !receipt ||
        receipt.status !== 'CONFIRMED' ||
        !receipt.purchaseOrderId ||
        receipt.store.status !== 'ACTIVE'
      )
        throw new ConflictException('Réception confirmée avec commande et magasin actif requise.');
      const lines = await Promise.all(
        input.lines.map(async (line) => {
          const original = receipt.lines.find((item) => item.id === line.receiptLineId);
          const quantity = new Prisma.Decimal(line.quantity);
          if (!original || !original.quantity.isFinite() || original.quantity.lte(0) || quantity.gt(original.quantity) || !original.unitCost.isFinite() || original.unitCost.lt(0))
            throw new ConflictException('Quantité supérieure à la réception ou ligne inconnue.');
          const total = quantity.mul(original.unitCost).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
          const serialIds = line.serialIds ?? [];
          if (new Set(serialIds).size !== serialIds.length || serialIds.length > 100)
            throw new ConflictException('Numéros de série en double ou trop nombreux.');
          if (serialIds.length) {
            if (!quantity.eq(serialIds.length))
              throw new ConflictException('La quantité doit correspondre aux numéros de série.');
            const count = await tx.serialNumber.count({
              where: {
                id: { in: serialIds },
                receiptLineId: original.id,
                productId: original.productId,
                currentStoreId: receipt.storeId,
                status: 'AVAILABLE',
              },
            });
            if (count !== serialIds.length)
              throw new ConflictException('Numéros de série non disponibles ou hors réception.');
          }
          return {
            receiptLineId: original.id,
            quantity,
            unitCost: original.unitCost,
            total,
            serials: { create: serialIds.map((serialId) => ({ serialId })) },
          };
        }),
      );
      const total = lines.reduce((sum, line) => sum.plus(line.total), new Prisma.Decimal(0));
      if (total.gt('9999999999999999.99')) throw new ConflictException('Montant hors limite.');
      const result = await tx.supplierReturn.create({
        data: {
          receiptId: receipt.id,
          operationKey: input.operationKey,
          reason: input.reason,
          createdBy: actor,
          total,
          lines: { create: lines },
        },
        include: { lines: { include: { serials: true } } },
      });
      await this.audit(tx, actor, 'SUPPLIER_RETURN_CREATED', result.id, receipt.storeId);
      return result;
    });
  }

  private assertValuation(item: Awaited<ReturnType<SupplierReturnsRepository['load']>>) {
    const maximum = new Prisma.Decimal('9999999999999999.99');
    if (
      !item.lines.length ||
      !item.total.isFinite() ||
      item.total.lt(0) ||
      item.total.gt(maximum) ||
      !item.total.eq(item.lines.reduce((sum, line) => sum.plus(line.total), new Prisma.Decimal(0)))
    )
      throw new ConflictException('Valorisation totale du retour incohérente.');
    for (const line of item.lines) {
      const original = line.receiptLine;
      if (
        original.receiptId !== item.receiptId ||
        !line.quantity.isFinite() ||
        !validReturnQuantity(line.quantity.toFixed()) ||
        !original.quantity.isFinite() ||
        line.quantity.gt(original.quantity) ||
        !original.unitCost.isFinite() ||
        original.unitCost.lt(0) ||
        !line.unitCost.eq(original.unitCost) ||
        !line.total.eq(line.quantity.mul(original.unitCost).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP))
      )
        throw new ConflictException('Valorisation de ligne de retour incohérente.');
    }
  }

  confirm(id: string, actor: string) {
    return this.transaction(actor, async (tx) => {
      const item = await this.load(tx, id);
      if (item.status === 'CONFIRMED') return item;
      if (item.status !== 'DRAFT' || item.receipt.status !== 'CONFIRMED' || !item.lines.length)
        throw new ConflictException('Retour non confirmable.');
      this.assertValuation(item);
      const store = await tx.store.findFirst({ where: { id: item.receipt.storeId, status: 'ACTIVE' } });
      if (!store) throw new ConflictException('Magasin inactif.');
      for (const line of [...item.lines].sort((a, b) =>
        a.receiptLine.productId.localeCompare(b.receiptLine.productId),
      )) {
        const original = line.receiptLine;
        if (original.receiptId !== item.receiptId)
          throw new ConflictException('Ligne de réception incohérente.');
        const returned = await tx.supplierReturnLine.aggregate({
          where: { receiptLineId: original.id, supplierReturn: { status: 'CONFIRMED' } },
          _sum: { quantity: true, total: true },
        });
        if ((returned._sum.quantity ?? new Prisma.Decimal(0)).plus(line.quantity).gt(original.quantity))
          throw new ConflictException('Quantité cumulée retournée supérieure à la réception.');
        const receivedValue = original.quantity.mul(original.unitCost).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        const priorValue = returned._sum.total ?? new Prisma.Decimal(0);
        if (priorValue.lt(0) || priorValue.plus(line.total).gt(receivedValue))
          throw new ConflictException('Valorisation cumulée supérieure à la réception.');
        const serialized = await tx.serialNumber.count({ where: { productId: original.productId } });
        if (serialized || line.serials.length) {
          const ids = line.serials.map((entry) => entry.serialId);
          if (!ids.length || !line.quantity.eq(ids.length))
            throw new ConflictException('Produit sérialisé : numéros de série obligatoires.');
          const changedSerials = await tx.serialNumber.updateMany({
            where: {
              id: { in: ids },
              productId: original.productId,
              receiptLineId: original.id,
              currentStoreId: store.id,
              status: 'AVAILABLE',
            },
            data: { status: 'RETURNED_TO_SUPPLIER', currentStoreId: null },
          });
          if (changedSerials.count !== ids.length)
            throw new ConflictException('Numéro de série indisponible ou hors réception.');
        }
        const stock = await tx.storeStock.findUnique({
          where: { storeId_productId: { storeId: store.id, productId: original.productId } },
        });
        if (!stock || stock.quantity.minus(stock.reserved).lt(line.quantity))
          throw new ConflictException('Stock disponible insuffisant.');
        const changed = await tx.storeStock.updateMany({
          where: { id: stock.id, quantity: stock.quantity, reserved: stock.reserved },
          data: { quantity: { decrement: line.quantity } },
        });
        if (changed.count !== 1) throw new ConflictException('Stock modifié simultanément.');
        await tx.stockMovement.create({
          data: {
            storeId: store.id,
            productId: original.productId,
            quantity: line.quantity,
            type: 'RETURN_OUT',
            referenceType: 'SUPPLIER_RETURN',
            referenceId: id,
            operationKey: 'supplier-return:' + id + ':' + line.id,
            actorId: actor,
            reason: item.reason,
          },
        });
      }
      await tx.supplierReturn.update({
        where: { id },
        data: { status: 'CONFIRMED', confirmedBy: actor, confirmedAt: new Date() },
      });
      await this.audit(tx, actor, 'SUPPLIER_RETURN_CONFIRMED', id, store.id);
      return this.load(tx, id);
    });
  }

  cancel(id: string, reason: string, actor: string) {
    return this.transaction(actor, async (tx) => {
      const item = await this.load(tx, id);
      if (item.status !== 'DRAFT') throw new ConflictException('Seul un brouillon peut être annulé.');
      await tx.supplierReturn.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledBy: actor,
          cancelledAt: new Date(),
          cancellationReason: reason,
        },
      });
      await this.audit(tx, actor, 'SUPPLIER_RETURN_CANCELLED', id, item.receipt.storeId);
      return this.load(tx, id);
    });
  }

  credit(id: string, reference: string, actor: string) {
    return this.transaction(actor, async (tx) => {
      const item = await this.load(tx, id);
      if (item.credit) {
        if (item.credit.reference === reference) return item.credit;
        throw new ConflictException('Avoir fournisseur déjà enregistré.');
      }
      if (item.status !== 'CONFIRMED' || !item.receipt.purchaseOrderId || item.total.lte(0))
        throw new ConflictException('Retour confirmé valorisé obligatoire.');
      this.assertValuation(item);
      const order = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: item.receipt.purchaseOrderId } });
      const result = await tx.supplierReturnCredit.create({
        data: {
          returnId: id,
          supplierId: order.supplierId,
          amount: item.total,
          reference,
          recordedBy: actor,
        },
      });
      await this.audit(tx, actor, 'SUPPLIER_RETURN_CREDIT_RECORDED', id, item.receipt.storeId);
      return result;
    });
  }
}
