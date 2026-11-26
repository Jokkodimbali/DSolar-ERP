import { ReconciliationCandidate, suggestReconciliations } from './bank-suggestions';

describe('Suggestions de rapprochement bancaire', () => {
  const candidate = (id: string, amount = '100.01', day = 4): ReconciliationCandidate => ({
    id,
    amount,
    date: new Date(Date.UTC(2026, 0, day)),
    description: id,
  });
  const run = (bankLines: ReconciliationCandidate[], ledgerLines: ReconciliationCandidate[]) =>
    suggestReconciliations({ statementId: 'statement', bankLines, ledgerLines });

  it('propose un montant signé identique dans la fenêtre de trois jours', () => {
    const result = run([candidate('bank')], [candidate('ledger', '100.01', 7)]);
    expect(result).toMatchObject({ unique: 1, ambiguous: 0, noMatch: 0 });
    expect(result.items[0].candidates[0]).toMatchObject({ ledgerLineId: 'ledger', daysApart: 3 });
  });

  it.each(['-100.01', '100.00', '100.02'])('refuse un montant différent : %s', (amount) => {
    expect(run([candidate('bank')], [candidate('ledger', amount)]).noMatch).toBe(1);
  });

  it('refuse une date à plus de trois jours', () => {
    expect(run([candidate('bank')], [candidate('ledger', '100.01', 8)]).noMatch).toBe(1);
  });

  it('détecte plusieurs écritures possibles même si une date est plus proche', () => {
    const result = run([candidate('bank')], [candidate('a', '100.01', 5), candidate('b')]);
    expect(result.ambiguous).toBe(1);
    expect(result.items[0].candidates.map((item) => item.ledgerLineId)).toEqual(['b', 'a']);
  });

  it('ne considère pas une écriture partagée entre deux lignes comme unique', () => {
    const result = run([candidate('bank1'), candidate('bank2')], [candidate('ledger')]);
    expect(result).toMatchObject({ unique: 0, ambiguous: 2 });
  });

  it('conserve les ambiguïtés au-delà de la limite d’affichage', () => {
    const result = run(
      [candidate('bank')],
      Array.from({ length: 6 }, (_, i) => candidate(String(i))),
    );
    expect(result.items[0]).toMatchObject({
      status: 'AMBIGUOUS',
      candidateCount: 6,
      hasMoreCandidates: true,
    });
    expect(result.items[0].candidates).toHaveLength(5);
  });

  it('compare exactement des montants négatifs et de grande précision', () => {
    expect(run([candidate('bank', '-0.01')], [candidate('ledger', '-0.01')]).unique).toBe(1);
    expect(
      run([candidate('bank', '9999999999999999.99')], [candidate('ledger', '9999999999999999.98')]).noMatch,
    ).toBe(1);
  });

  it('retourne une synthèse vide en l’absence de lignes à rapprocher', () => {
    expect(run([], [])).toMatchObject({ total: 0, unique: 0, ambiguous: 0, noMatch: 0, items: [] });
  });
});
