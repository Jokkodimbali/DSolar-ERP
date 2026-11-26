import { describe, expect, it } from 'vitest';
import { parseBalance, parseStatements } from './ledger.contract';

const id = 'c31ac59c-8148-4664-8745-496a9618f202';
const other = 'c31ac59c-8148-4664-8745-496a9618f203';
const debit = '999999999999999999.01';
const balance = {
  rows: [
    { id, code: '411', name: 'Clients', debit, credit: '0', balance: debit },
    { id: other, code: '701', name: 'Ventes', debit: '0', credit: debit, balance: '-' + debit },
  ],
  debit,
  credit: debit,
  balanced: true,
};

describe('Consultation comptable', () => {
  it('préserve les montants exacts et vérifie les totaux', () => {
    expect(parseBalance(balance).debit).toBe(debit);
    expect(() => parseBalance({ ...balance, credit: '999999999999999999.00' })).toThrow();
    expect(() => parseBalance({ ...balance, balanced: false })).toThrow();
  });

  it('refuse les doublons de comptes', () => {
    expect(() => parseBalance({ ...balance, rows: [balance.rows[0], balance.rows[0]] })).toThrow();
  });

  it('refuse un état incomplet présenté comme définitif ou associé à une autre période', () => {
    const state = {
      periodId: id,
      provisional: true,
      closed: false,
      pendingSources: '1',
      unpostedEntries: 0,
      priorOpenPeriods: 0,
      complete: false,
      unclassified: [{ accountId: id, code: '701', name: 'Ventes' }],
    };
    expect(parseStatements(state, id).complete).toBe(false);
    expect(() => parseStatements({ ...state, provisional: false }, id)).toThrow();
    expect(() => parseStatements(state, other)).toThrow();
  });
});
