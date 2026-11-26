import { describe, expect, it } from 'vitest';
import { customerInput, parseCustomer, parseCustomerPage, parsePendingCustomer } from './customer.contract';

const id = 'c31ac59c-8148-4664-8745-496a9618f202';
const input = { name: ' Client ', taxId: null, phone: ' ', email: ' TEST@EXAMPLE.COM ', address: null };
describe('Contrat des clients', () => {
  it('normalise les coordonnées et préserve la clé de création', () => {
    expect(customerInput(input)).toEqual({ name: 'Client', taxId: null, phone: null, email: 'test@example.com', address: null });
    expect(parsePendingCustomer({ operationKey: id, input }).operationKey).toBe(id);
    expect(() => customerInput({ ...input, name: ' ' })).toThrow();
  });
  it('contrôle les identifiants, dates et pagination', () => {
    const row = { ...input, id, createdAt: '2026-11-26T00:00:00Z' };
    const page = { items: [row], pagination: { page: 1, limit: 10, total: 1, pages: 1 } };
    expect(parseCustomerPage(page).items[0]).toEqual(parseCustomer(row));
    expect(() => parseCustomer({ ...row, createdAt: 'invalide' })).toThrow();
    expect(() => parseCustomerPage({ ...page, items: [] })).toThrow();
  });
});
