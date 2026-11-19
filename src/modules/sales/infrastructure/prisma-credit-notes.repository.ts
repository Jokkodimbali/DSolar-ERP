import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { CreditNotesRepository } from '../application/credit-notes.port';

@Injectable()
export class PrismaCreditNotesRepository implements CreditNotesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(invoiceId: string, actorId: string) {
    return this.prisma.creditNote.findMany({
      where: {
        invoiceId,
        invoice: {
          order: {
            lines: {
              some: {},
              every: { store: { userAccess: { some: { userId: actorId } } } },
            },
          },
        },
      },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async issue(invoiceId: string, actorId: string, amountText: string, reason: string) {
    const amount = new Prisma.Decimal(amountText);
    const normalizedReason = reason.trim();
    if (!amount.isFinite() || !amount.greaterThan(0) || amount.decimalPlaces() > 2) {
      throw new ConflictException('Montant de l’avoir invalide.');
    }
    if (normalizedReason.length < 10 || normalizedReason.length > 500) {
      throw new ConflictException('Un motif détaillé est obligatoire.');
    }
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId}::uuid FOR UPDATE`;
        const invoice = await tx.invoice.findUnique({
          where: { id: invoiceId },
          include: {
            creditNotes: true,
            allocations: true,
            order: { include: { lines: true } },
          },
        });
        if (!invoice) throw new NotFoundException('Facture introuvable.');
        if (invoice.status !== 'ISSUED') {
          throw new ConflictException('Seule une facture émise peut faire l’objet d’un avoir.');
        }
        if (!invoice.order) throw new ConflictException('Facture sans commande associée.');
        const stores = [...new Set(invoice.order.lines.map((line) => line.storeId))];
        const allowed = await tx.userStoreAccess.count({
          where: { userId: actorId, storeId: { in: stores } },
        });
        if (!stores.length || allowed !== stores.length) {
          throw new ForbiddenException('Accès magasin refusé.');
        }
        const credited = invoice.creditNotes.reduce(
          (sum, note) => sum.plus(note.amount),
          new Prisma.Decimal(0),
        );
        const allocated = invoice.allocations.reduce(
          (sum, allocation) => sum.plus(allocation.amount),
          new Prisma.Decimal(0),
        );
        const available = invoice.totalTtc.minus(credited).minus(allocated);
        if (amount.greaterThan(available)) {
          throw new ConflictException('Avoir supérieur au solde non réglé de la facture.');
        }
        const creditNote = await tx.creditNote.create({
          data: {
            number: `AV-${randomUUID().slice(0, 12).toUpperCase()}`,
            invoiceId,
            amount,
            reason: normalizedReason,
            issuedAt: new Date(),
          },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'CREDIT_NOTE_ISSUED',
            entityType: 'CreditNote',
            entityId: creditNote.id,
            payload: { invoiceId, amount: amount.toString(), reason: normalizedReason },
          },
        });
        return creditNote;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
