import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Participe à la transaction sérialisable de contrepassation commerciale. */
export async function reverseReconciledCashPayment(
  tx: Prisma.TransactionClient,
  paymentId: string,
  actorId: string,
  reason: string,
): Promise<void> {
  const original = await tx.cashMovement.findUnique({
    where: { paymentId },
    include: { session: { include: { register: true } }, reversal: true },
  });
  if (!original) return;
  if (original.reversal || original.amount.lte(0)) {
    throw new ConflictException('Encaissement de caisse incohérent ou déjà contrepassé.');
  }
  const session = await tx.cashSession.findFirst({
    where: { registerId: original.session.registerId, closedAt: null },
  });
  if (!session) {
    throw new ConflictException('Ouvrir une session sur la caisse d’origine avant le remboursement.');
  }
  const totals = await tx.cashMovement.aggregate({
    where: { sessionId: session.id },
    _sum: { amount: true },
  });
  if (session.opening.plus(totals._sum.amount ?? 0).lt(original.amount)) {
    throw new ConflictException('Solde de caisse insuffisant pour rembourser cet encaissement.');
  }
  const movement = await tx.cashMovement.create({
    data: {
      sessionId: session.id,
      amount: original.amount.negated(),
      reason: 'Remboursement commercial',
      operationKey: randomUUID(),
      reversalOfId: original.id,
      actorId,
    },
  });
  await tx.auditLog.create({
    data: {
      actorId,
      storeId: original.session.register.storeId,
      action: 'CASH_PAYMENT_REVERSED',
      entityType: 'Treasury',
      entityId: movement.id,
      payload: { paymentId, originalMovementId: original.id, reason },
    },
  });
}
