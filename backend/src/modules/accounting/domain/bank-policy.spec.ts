import { validateStatement, BankStatementInput } from './bank-policy';

describe('Contrôle des relevés bancaires', () => {
  const input: BankStatementInput = {
    bankAccountId: 'test',
    reference: 'REF',
    start: '2095-01-01',
    end: '2095-01-31',
    opening: '100.00',
    closing: '100.01',
    lines: [
      { reference: 'A', date: '2095-01-03', description: 'Entrée', amount: '0.03' },
      { reference: 'B', date: '2095-01-04', description: 'Sortie', amount: '-0.02' },
    ],
  };
  it('calcule exactement les mouvements signés', () => expect(() => validateStatement(input)).not.toThrow());
  it('rejette un centime d’écart', () =>
    expect(() => validateStatement({ ...input, closing: '100.00' })).toThrow());
  it('rejette une ligne hors période', () =>
    expect(() =>
      validateStatement({ ...input, lines: [{ ...input.lines[0], date: '2095-02-01' }, input.lines[1]] }),
    ).toThrow());
  it('rejette les références en double', () =>
    expect(() =>
      validateStatement({ ...input, lines: [input.lines[0], { ...input.lines[1], reference: 'A' }] }),
    ).toThrow());
});
