import { aggregateCents, moneyText } from './ledger-policy';

export const ACCOUNT_CLASSES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const;
export type AccountClass = (typeof ACCOUNT_CLASSES)[number];

export interface StatementAccount {
  accountId: string;
  code: string;
  name: string;
  category: AccountClass | null;
  openingDebit: string;
  openingCredit: string;
  periodDebit: string;
  periodCredit: string;
}

export function buildFinancialStatements(accounts: StatementAccount[]) {
  const missing = accounts.filter((row) => !row.category &&
    [row.openingDebit, row.openingCredit, row.periodDebit, row.periodCredit].some((value) => aggregateCents(value) !== 0n));
  if (missing.length) return { complete: false as const, unclassified: missing.map(({ accountId, code, name }) => ({ accountId, code, name })) };
  let assets = 0n;
  let liabilities = 0n;
  let equity = 0n;
  let revenue = 0n;
  let expenses = 0n;
  let previousResult = 0n;
  const rows = accounts.filter((row) => row.category !== null).map((row) => {
    const opening = aggregateCents(row.openingDebit) - aggregateCents(row.openingCredit);
    const movement = aggregateCents(row.periodDebit) - aggregateCents(row.periodCredit);
    const ending = opening + movement;
    switch (row.category) {
      case 'ASSET': assets += ending; break;
      case 'LIABILITY': liabilities -= ending; break;
      case 'EQUITY': equity -= ending; break;
      case 'REVENUE': revenue -= movement; previousResult -= opening; break;
      case 'EXPENSE': expenses += movement; previousResult -= opening; break;
    }
    return { accountId: row.accountId, code: row.code, name: row.name, category: row.category,
      openingBalance: moneyText(opening), periodMovement: moneyText(movement), closingBalance: moneyText(ending) };
  });
  const result = revenue - expenses;
  const totalEquity = equity + previousResult + result;
  const totalLiabilitiesAndEquity = liabilities + totalEquity;
  return {
    complete: true as const, rows,
    incomeStatement: { revenue: moneyText(revenue), expenses: moneyText(expenses), result: moneyText(result) },
    balanceSheet: { assets: moneyText(assets), liabilities: moneyText(liabilities), equity: moneyText(equity),
      previousUnallocatedResult: moneyText(previousResult), currentResult: moneyText(result),
      totalEquity: moneyText(totalEquity), totalLiabilitiesAndEquity: moneyText(totalLiabilitiesAndEquity),
      difference: moneyText(assets - totalLiabilitiesAndEquity), balanced: assets === totalLiabilitiesAndEquity },
  };
}
