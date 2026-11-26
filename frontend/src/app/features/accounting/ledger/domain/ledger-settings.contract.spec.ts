import { describe, expect, it } from 'vitest';
import { classificationAction, periodAction, ruleAction } from './ledger-settings.contract';

const journal = 'c31ac59c-8148-4664-8745-496a9618f201';
const debit = 'c31ac59c-8148-4664-8745-496a9618f202';
const credit = 'c31ac59c-8148-4664-8745-496a9618f203';

describe('Paramétrage comptable', () => {
  it('valide les périodes et classes', () => {
    expect(periodAction('Novembre', '2026-11-01', '2026-11-30').kind).toBe('periods');
    expect(() => periodAction('Novembre', '2026-11-30', '2026-11-01')).toThrow();
    expect(() => classificationAction(debit, 'UNKNOWN')).toThrow();
  });

  it('refuse une règle invalide et les comptes identiques', () => {
    expect(ruleAction('PAYMENT:CASH', journal, debit, credit, '').kind).toBe('rules');
    expect(() => ruleAction('OTHER', journal, debit, credit, '')).toThrow();
    expect(() => ruleAction('INVOICE', journal, debit, debit, '')).toThrow();
    expect(() => ruleAction('PAYMENT:CASH', journal, debit, credit, journal)).toThrow();
  });
});
