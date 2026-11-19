import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RecordPaymentDto } from './record-payment.dto';
import { AllocatePaymentDto } from './allocate-payment.dto';
import { IssueCreditNoteDto } from './issue-credit-note.dto';

describe('Financial amount validation', () => {
  const cases = [
    {
      dto: RecordPaymentDto,
      extra: { method: 'CASH', idempotencyKey: 'unique-payment-123' },
    },
    {
      dto: AllocatePaymentDto,
      extra: { invoiceId: '00000000-0000-4000-8000-000000000001' },
    },
    {
      dto: IssueCreditNoteDto,
      extra: { reason: 'Correction documentée' },
    },
  ];

  it.each(cases)('accepte les montants valides pour $dto', async ({ dto, extra }) => {
    for (const amount of ['1', '1.5', '1.50', '1000000.00']) {
      const errors = await validate(plainToInstance(dto as typeof RecordPaymentDto, { ...extra, amount }));
      expect(errors).toHaveLength(0);
    }
  });

  it.each(cases)('refuse les montants invalides pour $dto', async ({ dto, extra }) => {
    for (const amount of ['-1', '1.001', '1e3', '1,50', 'abc', '']) {
      const errors = await validate(plainToInstance(dto as typeof RecordPaymentDto, { ...extra, amount }));
      expect(errors.length).toBeGreaterThan(0);
    }
  });
});
