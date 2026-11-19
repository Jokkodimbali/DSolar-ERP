import { PaymentMethod } from '@prisma/client';

export const PAYMENTS_REPOSITORY = Symbol('PAYMENTS_REPOSITORY');

export interface RecordPaymentInput {
  amount: string;
  method: PaymentMethod;
  idempotencyKey: string;
  externalReference?: string;
}

export interface PaymentsRepository {
  list(orderId: string, actorId: string): Promise<unknown[]>;
  record(orderId: string, actorId: string, input: RecordPaymentInput): Promise<unknown>;
  reverse(orderId: string, paymentId: string, actorId: string, reason: string): Promise<unknown>;
  allocate(
    orderId: string,
    paymentId: string,
    invoiceId: string,
    actorId: string,
    amount: string,
  ): Promise<unknown>;
}
