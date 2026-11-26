import { Inject, Injectable } from '@nestjs/common';
import { PAYMENTS_REPOSITORY, PaymentsRepository, RecordPaymentInput } from './payments.port';
import { summarizeOrderPayments } from '../domain/order-payment-summary';

@Injectable()
export class PaymentsService {
  constructor(@Inject(PAYMENTS_REPOSITORY) private readonly payments: PaymentsRepository) {}

  list(orderId: string, actorId: string) {
    return this.payments.list(orderId, actorId);
  }

  allocations(orderId: string, actorId: string) {
    return this.payments.allocationSnapshot(orderId, actorId);
  }

  async summary(orderId: string, actorId: string) {
    return summarizeOrderPayments(await this.payments.summarySnapshot(orderId, actorId));
  }

  record(orderId: string, actorId: string, input: RecordPaymentInput) {
    return this.payments.record(orderId, actorId, input);
  }
  reverse(orderId: string, paymentId: string, actorId: string, reason: string) {
    return this.payments.reverse(orderId, paymentId, actorId, reason);
  }
  allocate(orderId: string, paymentId: string, invoiceId: string, actorId: string, amount: string) {
    return this.payments.allocate(orderId, paymentId, invoiceId, actorId, amount);
  }
  cancelAllocation(
    orderId: string,
    paymentId: string,
    allocationId: string,
    actorId: string,
    reason: string,
  ) {
    return this.payments.cancelAllocation(orderId, paymentId, allocationId, actorId, reason);
  }
}
