import { describe, expect, it } from 'vitest';
import { blankFilters, normalizeFilters, parseAuditPage, parseAuditSummary } from './audit.contract';

const id = 'c31ac59c-8148-4664-8745-496a9618f202';
const row = {
  id,
  actorId: null,
  storeId: null,
  action: 'LEDGER_ENTRY_POSTED',
  entityType: 'Accounting',
  entityId: id,
  createdAt: '2026-11-26T10:00:00.000Z',
};

describe('Journal d’audit', () => {
  it('valide les filtres et refuse les dates incohérentes', () => {
    expect(normalizeFilters({ ...blankFilters(), action: ' INVOICE_ISSUED ' }).action).toBe('INVOICE_ISSUED');
    expect(() => normalizeFilters({ ...blankFilters(), from: '2026-02-30' })).toThrow();
    expect(() => normalizeFilters({ ...blankFilters(), from: '2026-11-26', to: '2026-11-25' })).toThrow();
    expect(() => normalizeFilters({ ...blankFilters(), actorId: 'incorrect' })).toThrow();
  });

  it('vérifie les filtres retournés, les doublons et le curseur', () => {
    const page = { items: [row], nextCursor: null };
    expect(parseAuditPage(page, blankFilters(), 30).items).toHaveLength(1);
    expect(() => parseAuditPage(page, { ...blankFilters(), action: 'OTHER' }, 30)).toThrow();
    expect(() => parseAuditPage({ items: [row, row], nextCursor: null }, blankFilters(), 30)).toThrow();
    expect(() => parseAuditPage({ ...page, nextCursor: id }, blankFilters(), 30)).toThrow();
  });

  it('ne conserve pas les détails sensibles du payload', () => {
    const page = { items: [{ ...row, payload: { password: 'secret' } }], nextCursor: null };
    expect(parseAuditPage(page, blankFilters(), 30).items[0]).not.toHaveProperty('payload');
  });

  it('refuse une synthèse dont les totaux sont incohérents', () => {
    const report = {
      total: 1,
      byAction: [{ action: row.action, count: 1 }],
      byEntityType: [{ entityType: row.entityType, count: 1 }],
    };
    expect(parseAuditSummary(report).total).toBe(1);
    expect(() => parseAuditSummary({ ...report, total: 2 })).toThrow();
  });
});
