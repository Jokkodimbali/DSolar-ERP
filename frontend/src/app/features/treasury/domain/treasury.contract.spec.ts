import { describe, expect, it } from 'vitest';
import { cents, cashInput, parseSummary, verifyCashCommand } from './treasury.contract';
const id = 'c31ac59c-8148-4664-8745-496a9618f202';
const other = 'c31ac59c-8148-4664-8745-496a9618f203';
const summary = { sessionId: id, opening: '100', entries: '50.25', exits: '20.10', expected: '130.15', counted: null, difference: null, closedAt: null, movementCount: 2 };
describe('Trésorerie', () => {
  it('contrôle les agrégats sans perte de précision', () => {
    expect(parseSummary(summary, id).expected).toBe('130.15');
    expect(() => parseSummary({ ...summary, expected: '130.14' }, id)).toThrow();
    expect(cents('9999999999999999.99')).toBe(999999999999999999n);
    expect(() => cashInput('1.001')).toThrow();
  });
  it('vérifie un transfert équilibré et les identifiants de session', () => {
    const command = { kind: 'transfer', sessionId: id, destinationId: other, amount: '50', operationKey: id } as const;
    const debit = { id, sessionId: id, amount: '-50', operationKey: id, reason: 'Transfert sortant', createdAt: '2026-11-26T00:00:00Z', transferKey: id, reversalOfId: null, paymentId: null };
    const credit = { ...debit, id: other, sessionId: other, operationKey: other, amount: '50' };
    expect(verifyCashCommand({ debit, credit }, command).id).toBe(id);
    expect(() => verifyCashCommand({ debit, credit: { ...credit, amount: '49.99' } }, command)).toThrow();
  });
});
