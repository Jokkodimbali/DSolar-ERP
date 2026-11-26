import { describe, expect, it } from 'vitest';
import { expenseActions, expensePayment, parseExpense, parseExpenseSummary, parseOpenCashSessions, verifyCreatedExpense } from './expense.contract';
const id = 'c31ac59c-8148-4664-8745-496a9618f202';
const other = 'c31ac59c-8148-4664-8745-496a9618f203';
const input = { storeId: id, categoryId: id, description: 'Transport', amount: '70.25', operationKey: other };
const row = { ...input, id, status: 'DRAFT', createdAt: '2026-11-26T00:00:00Z',
  approvedAt: null, paidAt: null, endedAt: null, method: null, reference: null,
  cashMovementId: null, refundMovementId: null, endReason: null };
describe('Dépenses', () => {
  it('vérifie le montant exact et la clé de création', () => {
    expect(verifyCreatedExpense(row, input).id).toBe(id);
    expect(() => verifyCreatedExpense({ ...row, amount: '70.26' }, input)).toThrow();
    expect(() => parseExpense({ ...row, status: 'PAID' })).toThrow();
    expect(expenseActions('REFUNDED')).toEqual([]);
  });
  it('réserve le paiement espèces à une caisse ouverte du bon magasin', () => {
    const approved = parseExpense({ ...row, status: 'APPROVED', approvedAt: row.createdAt });
    const sessions = parseOpenCashSessions([{ id, storeId: id, name: 'Caisse', sessions: [{ id: other, registerId: id, closedAt: null }] }]);
    expect(expensePayment(approved, 'CASH', other, '', sessions)).toEqual({ method: 'CASH', sessionId: other });
    expect(() => expensePayment(approved, 'CASH', other, '', [{ id: other, storeId: other, name: 'Autre' }])).toThrow();
    expect(() => expensePayment(approved, 'BANK_TRANSFER', '', '', sessions)).toThrow();
  });
  it('valide les agrégats sans transformer les brouillons en dépenses réglées', () => {
    expect(parseExpenseSummary([{ status: 'DRAFT', categoryId: id, _count: 1, _sum: { amount: '70.25' } }])[0]?.status).toBe('DRAFT');
    expect(() => parseExpenseSummary([{ status: 'PAID', categoryId: id, _count: 1, _sum: { amount: '-1' } }])).toThrow();
  });
});
