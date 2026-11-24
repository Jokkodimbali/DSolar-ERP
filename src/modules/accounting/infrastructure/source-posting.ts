import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PostingLine } from '../domain/ledger-policy';
import { SourceType } from '../domain/source-types';

type SourcePosting = {
  date: Date;
  description: string;
  journalId: string;
  lines: PostingLine[];
  reversalOfId?: string;
};

type Original = Prisma.LedgerEntryGetPayload<{ include: { lines: true; reversal: true } }>;

async function original(tx: Prisma.TransactionClient, type: SourceType, id: string): Promise<Original> {
  const entry = await tx.ledgerEntry.findUnique({
    where: { sourceType_sourceId: { sourceType: type, sourceId: id } },
    include: { lines: true, reversal: true },
  });
  if (!entry?.postedAt || entry.reversal)
    throw new ConflictException('Comptabiliser d’abord la pièce d’origine non contrepassée.');
  return entry;
}

function reverse(entry: Original, date: Date, description: string): SourcePosting {
  return {
    date,
    description,
    journalId: entry.journalId,
    reversalOfId: entry.id,
    lines: entry.lines.map((line) => ({
      accountId: line.accountId,
      debit: line.credit.toFixed(2),
      credit: line.debit.toFixed(2),
    })),
  };
}

async function fromRule(
  tx: Prisma.TransactionClient,
  key: string,
  date: Date,
  description: string,
  amount: Prisma.Decimal,
  tax = new Prisma.Decimal(0),
): Promise<SourcePosting> {
  if (amount.lte(0) || tax.lt(0) || tax.gt(amount))
    throw new ConflictException('Montant de la pièce invalide.');
  const rule = await tx.ledgerPostingRule.findUnique({ where: { key } });
  if (!rule) throw new ConflictException('Règle comptable manquante : ' + key);
  if (tax.gt(0) && !rule.taxAccountId) throw new ConflictException('Compte de taxe obligatoire.');
  const lines: PostingLine[] = [{ accountId: rule.debitAccountId, debit: amount.toFixed(2), credit: '0' }];
  if (amount.gt(tax))
    lines.push({ accountId: rule.creditAccountId, debit: '0', credit: amount.minus(tax).toFixed(2) });
  if (tax.gt(0) && rule.taxAccountId)
    lines.push({ accountId: rule.taxAccountId, debit: '0', credit: tax.toFixed(2) });
  return { date, description, journalId: rule.journalId, lines };
}

export async function buildSourcePosting(
  tx: Prisma.TransactionClient,
  type: SourceType,
  id: string,
): Promise<SourcePosting> {
  switch (type) {
    case 'INVOICE': {
      const item = await tx.invoice.findUnique({ where: { id } });
      if (!item) throw new NotFoundException('Facture introuvable.');
      if (item.status !== 'ISSUED' || !item.issuedAt || !item.totalHt.plus(item.totalTax).eq(item.totalTtc))
        throw new ConflictException('Facture émise et totaux cohérents requis.');
      return fromRule(tx, type, item.issuedAt, 'Facture ' + item.number, item.totalTtc, item.totalTax);
    }
    case 'CREDIT_NOTE': {
      const item = await tx.creditNote.findUnique({ where: { id }, include: { invoice: true } });
      if (!item) throw new NotFoundException('Avoir client introuvable.');
      if (!item.issuedAt || item.amount.lte(0) || item.invoice.status !== 'ISSUED')
        throw new ConflictException('Avoir émis sur facture valide requis.');
      const entry = await original(tx, 'INVOICE', item.invoiceId);
      const debit = entry.lines.filter((line) => line.debit.gt(0));
      const credits = entry.lines.filter((line) => line.credit.gt(0));
      if (debit.length !== 1 || !credits.length || !debit[0].debit.eq(item.invoice.totalTtc))
        throw new ConflictException('Imputation initiale incompatible.');
      const related = await tx.creditNote.findMany({
        where: { invoiceId: item.invoiceId },
        select: { id: true },
      });
      const prior = await tx.ledgerLine.aggregate({
        where: {
          entry: {
            sourceType: 'CREDIT_NOTE',
            sourceId: { in: related.map((row) => row.id) },
            postedAt: { not: null },
          },
        },
        _sum: { debit: true },
      });
      const already = prior._sum.debit ?? new Prisma.Decimal(0);
      if (already.plus(item.amount).gt(debit[0].debit))
        throw new ConflictException('Avoirs cumulés supérieurs à la facture.');
      let lines: PostingLine[];
      if (item.netAmount !== null && item.taxAmount !== null) {
        if (!item.netAmount.plus(item.taxAmount).eq(item.amount))
          throw new ConflictException('Ventilation de l’avoir incohérente.');
        const candidates = credits.filter((line) => line.credit.eq(item.invoice.totalHt));
        let revenue = candidates.length === 1 ? candidates[0] : undefined;
        if (!revenue && candidates.length > 1) {
          const classified = await tx.ledgerAccountClassification.findMany({
            where: { accountId: { in: candidates.map((line) => line.accountId) }, category: 'REVENUE' },
          });
          if (classified.length === 1) revenue = candidates.find((line) => line.accountId === classified[0].accountId);
        }
        const tax = credits.find((line) => line.accountId !== revenue?.accountId && line.credit.eq(item.invoice.totalTax));
        if ((item.netAmount.gt(0) && !revenue) || (item.taxAmount.gt(0) && !tax))
          throw new ConflictException('Imputation fiscale historique ambiguë.');
        lines = [];
        if (item.netAmount.gt(0) && revenue)
          lines.push({ accountId: revenue.accountId, debit: item.netAmount.toFixed(2), credit: '0' });
        if (item.taxAmount.gt(0) && tax)
          lines.push({ accountId: tax.accountId, debit: item.taxAmount.toFixed(2), credit: '0' });
        for (const line of lines) {
          const originalCredit = credits.find((credit) => credit.accountId === line.accountId);
          const previous = await tx.ledgerLine.aggregate({
            where: { accountId: line.accountId, entry: { sourceType: 'CREDIT_NOTE',
              sourceId: { in: related.map((row) => row.id) }, postedAt: { not: null } } }, _sum: { debit: true },
          });
          if (!originalCredit || (previous._sum.debit ?? new Prisma.Decimal(0)).plus(line.debit).gt(originalCredit.credit))
            throw new ConflictException('Avoir fiscal cumulé supérieur au montant original.');
        }
      } else {
        if (item.invoice.totalTax.gt(0) && !item.amount.eq(item.invoice.totalTtc))
          throw new ConflictException('Ventilation fiscale détaillée requise pour un avoir partiel taxable.');
        lines = item.amount.eq(item.invoice.totalTtc)
          ? credits.map((line) => ({ accountId: line.accountId, debit: line.credit.toFixed(2), credit: '0' }))
          : credits.length === 1
            ? [{ accountId: credits[0].accountId, debit: item.amount.toFixed(2), credit: '0' }]
            : [];
      }
      if (!lines.length) throw new ConflictException('Ventilation de l’avoir requise.');
      lines.push({ accountId: debit[0].accountId, debit: '0', credit: item.amount.toFixed(2) });
      return {
        date: item.issuedAt,
        journalId: entry.journalId,
        description: 'Avoir client ' + item.number,
        lines,
      };
    }
    case 'CASH_TRANSFER': {
      const movements = await tx.cashMovement.findMany({
        where: { transferKey: id },
        include: { session: true },
      });
      const outgoing = movements.find((movement) => movement.amount.lt(0));
      const incoming = movements.find((movement) => movement.amount.gt(0));
      if (
        movements.length !== 2 ||
        !outgoing ||
        !incoming ||
        !outgoing.amount.negated().eq(incoming.amount) ||
        outgoing.session.registerId === incoming.session.registerId ||
        outgoing.createdAt.toISOString().slice(0, 10) !== incoming.createdAt.toISOString().slice(0, 10)
      )
        throw new ConflictException('Transfert intercaisses incohérent ou introuvable.');
      return fromRule(
        tx,
        'CASH_TRANSFER:' + outgoing.session.registerId + ':' + incoming.session.registerId,
        outgoing.createdAt,
        'Transfert intercaisses ' + id,
        incoming.amount,
      );
    }
    case 'PAYMENT': {
      const item = await tx.payment.findUnique({ where: { id } });
      if (!item) throw new NotFoundException('Paiement introuvable.');
      return fromRule(tx, type + ':' + item.method, item.receivedAt, 'Encaissement ' + id, item.amount);
    }
    case 'PAYMENT_REVERSAL': {
      const item = await tx.paymentReversal.findUnique({ where: { id } });
      if (!item) throw new NotFoundException('Contrepassation introuvable.');
      const entry = await original(tx, 'PAYMENT', item.paymentId);
      const debit = entry.lines.reduce((sum, line) => sum.plus(line.debit), new Prisma.Decimal(0));
      if (!debit.eq(item.amount))
        throw new ConflictException('Contrepassation partielle non prise en charge.');
      return reverse(entry, item.createdAt, 'Remboursement client ' + id);
    }
    case 'EXPENSE': {
      const item = await tx.expense.findUnique({ where: { id } });
      if (!item) throw new NotFoundException('Dépense introuvable.');
      if (!item.paidAt || !item.method || !['PAID', 'REFUNDED'].includes(item.status))
        throw new ConflictException('Dépense payée obligatoire.');
      return fromRule(
        tx,
        type + ':' + item.method + ':' + item.categoryId,
        item.paidAt,
        'Dépense ' + id,
        item.amount,
      );
    }
    case 'EXPENSE_REFUND': {
      const item = await tx.expense.findUnique({ where: { id } });
      if (!item) throw new NotFoundException('Dépense introuvable.');
      if (item.status !== 'REFUNDED' || !item.endedAt) throw new ConflictException('Dépense non remboursée.');
      return reverse(await original(tx, 'EXPENSE', id), item.endedAt, 'Remboursement de dépense ' + id);
    }
    case 'GOODS_RECEIPT': {
      const item = await tx.goodsReceipt.findUnique({ where: { id }, include: { lines: true } });
      if (!item) throw new NotFoundException('Réception introuvable.');
      if (item.status !== 'CONFIRMED' || !item.receivedAt)
        throw new ConflictException('Réception confirmée obligatoire.');
      const amount = item.lines.reduce(
        (sum, line) =>
          sum.plus(line.quantity.mul(line.unitCost).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)),
        new Prisma.Decimal(0),
      );
      return fromRule(tx, type, item.receivedAt, 'Réception ' + item.number, amount);
    }
    case 'SUPPLIER_RETURN': {
      const item = await tx.supplierReturn.findUnique({ where: { id } });
      if (!item) throw new NotFoundException('Retour introuvable.');
      if (item.status !== 'CONFIRMED' || !item.confirmedAt || item.total.lte(0))
        throw new ConflictException('Retour confirmé valorisé obligatoire.');
      const entry = await original(tx, 'GOODS_RECEIPT', item.receiptId);
      const debit = entry.lines.find((line) => line.debit.gt(0));
      const credit = entry.lines.find((line) => line.credit.gt(0));
      if (entry.lines.length !== 2 || !debit || !credit)
        throw new ConflictException('Imputation de la réception non compatible.');
      const related = await tx.supplierReturn.findMany({
        where: { receiptId: item.receiptId },
        select: { id: true },
      });
      const prior = await tx.ledgerLine.aggregate({
        where: {
          entry: {
            sourceType: 'SUPPLIER_RETURN',
            sourceId: { in: related.map((row) => row.id) },
            postedAt: { not: null },
          },
        },
        _sum: { debit: true },
      });
      if ((prior._sum.debit ?? new Prisma.Decimal(0)).plus(item.total).gt(debit.debit))
        throw new ConflictException('Valorisation cumulée supérieure à la réception.');
      return {
        date: item.confirmedAt,
        description: 'Retour fournisseur ' + id,
        journalId: entry.journalId,
        lines: [
          { accountId: credit.accountId, debit: item.total.toFixed(2), credit: '0' },
          { accountId: debit.accountId, debit: '0', credit: item.total.toFixed(2) },
        ],
      };
    }
    case 'CASH_MOVEMENT': {
      const item = await tx.cashMovement.findUnique({
        where: { id },
        include: {
          expensePayment: true,
          expenseRefund: true,
          reversalOf: { include: { expensePayment: true } },
        },
      });
      if (!item) throw new NotFoundException('Mouvement de caisse introuvable.');
      if (
        item.transferKey ||
        item.paymentId ||
        item.expensePayment ||
        item.expenseRefund ||
        item.reversalOf?.paymentId ||
        item.reversalOf?.expensePayment
      )
        throw new ConflictException(
          'Comptabiliser la pièce commerciale liée ; transfert à traiter séparément.',
        );
      if (item.reversalOfId)
        return reverse(
          await original(tx, type, item.reversalOfId),
          item.createdAt,
          'Correction caisse ' + id,
        );
      return fromRule(
        tx,
        item.amount.gt(0) ? 'CASH_IN' : 'CASH_OUT',
        item.createdAt,
        'Mouvement caisse ' + id,
        item.amount.abs(),
      );
    }
  }
}
