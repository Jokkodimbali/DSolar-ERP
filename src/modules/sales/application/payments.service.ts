import { Inject, Injectable } from '@nestjs/common';
import { PAYMENTS_REPOSITORY, PaymentsRepository, RecordPaymentInput } from './payments.port';

@Injectable()
export class PaymentsService {
  constructor(@Inject(PAYMENTS_REPOSITORY) private readonly payments: PaymentsRepository) {}

  list(orderId: string, actorId: string) {
    return this.payments.list(orderId, actorId);
  }

  record(orderId: string, actorId: string, input: RecordPaymentInput) {
    return this.payments.record(orderId, actorId, input);
  }
}
