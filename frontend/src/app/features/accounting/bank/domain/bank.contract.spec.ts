import { describe, expect, it } from 'vitest';
import { parseStatementInput, parseTabularLines } from './bank.contract';
const id = 'c31ac59c-8148-4664-8745-496a9618f202';
const lines = parseTabularLines('reference\tdate\tdescription\tmontant\nREF-1\t2026-11-03\tEntrée\t100,25\nREF-2\t2026-11-04\tSortie\t-20,10');
const input = { bankAccountId: id, reference: 'RELEVE-1', start: '2026-11-01', end: '2026-11-30', opening: '-10', closing: '70.15', lines };
describe('Relevés bancaires', () => {
  it('vérifie les montants signés exacts', () => {
    expect(parseStatementInput(input).closing).toBe('70.15');
    expect(() => parseStatementInput({ ...input, closing: '70.14' })).toThrow();
  });
  it('refuse les dates invalides, les doublons et les formats non définis', () => {
    expect(() => parseStatementInput({ ...input, lines: [lines[0], lines[0]] })).toThrow();
    expect(() => parseTabularLines('reference\tdate\tdescription\tmontant\nREF\t2026-11-31\tEntrée\t1')).toThrow();
    expect(() => parseTabularLines('date;montant')).toThrow();
  });
});
