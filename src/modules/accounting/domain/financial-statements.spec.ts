import { buildFinancialStatements, StatementAccount } from './financial-statements';

function row(category: StatementAccount['category'], openingDebit: string, openingCredit: string, periodDebit: string, periodCredit: string): StatementAccount {
  return { accountId: String(category), code: String(category), name: String(category), category, openingDebit, openingCredit, periodDebit, periodCredit };
}

describe('États financiers internes', () => {
  it('calcule les soldes, résultats et reports sans double comptage', () => {
    const result = buildFinancialStatements([
      row('ASSET', '100', '0', '50.10', '20.20'),
      row('EQUITY', '0', '80', '0', '0'),
      row('REVENUE', '0', '20', '0', '50.10'),
      row('EXPENSE', '0', '0', '20.20', '0'),
    ]);
    expect(result.complete).toBe(true);
    if (!result.complete) throw new Error('Incomplete');
    expect(result.incomeStatement.result).toBe('29.90');
    expect(result.balanceSheet.previousUnallocatedResult).toBe('20.00');
    expect(result.balanceSheet.assets).toBe('129.90');
    expect(result.balanceSheet.totalLiabilitiesAndEquity).toBe('129.90');
    expect(result.balanceSheet.balanced).toBe(true);
  });

  it('ne masque pas une perte', () => {
    const result = buildFinancialStatements([row('ASSET', '100', '0', '0', '10.01'),
      row('EQUITY', '0', '100', '0', '0'), row('EXPENSE', '0', '0', '10.01', '0')]);
    if (!result.complete) throw new Error('Incomplete');
    expect(result.incomeStatement.result).toBe('-10.01');
    expect(result.balanceSheet.balanced).toBe(true);
  });

  it('refuse un compte non classé même si son solde net est nul', () => {
    expect(buildFinancialStatements([row(null, '0', '0', '1', '1')]).complete).toBe(false);
  });
  it('ne force pas un bilan déséquilibré à zéro', () => {
    const result = buildFinancialStatements([row('ASSET', '0', '0', '0.01', '0')]);
    if (!result.complete) throw new Error('Incomplete');
    expect(result.balanceSheet.difference).toBe('0.01');
    expect(result.balanceSheet.balanced).toBe(false);
  });
});
