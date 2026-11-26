import { aggregateCents } from './ledger-policy';

export interface ReconciliationCandidate {
  id: string;
  date: Date;
  amount: string;
  description: string;
}

export interface ReconciliationSnapshot {
  statementId: string;
  bankLines: ReconciliationCandidate[];
  ledgerLines: ReconciliationCandidate[];
}

const MAX_DAYS = 3;
const DAY_MS = 86400000;
const MAX_DISPLAYED = 5;

/** Suggestions only: no mutation, no matching based on a rounded or absolute amount. */
export function suggestReconciliations(snapshot: ReconciliationSnapshot) {
  const byAmount = new Map<bigint, ReconciliationCandidate[]>();
  for (const line of snapshot.ledgerLines) {
    const amount = aggregateCents(line.amount);
    const group = byAmount.get(amount) ?? [];
    group.push(line);
    byAmount.set(amount, group);
  }
  const reverseCounts = new Map<string, number>();
  const matches = snapshot.bankLines.map((bank) => {
    const candidates = (byAmount.get(aggregateCents(bank.amount)) ?? [])
      .map((ledger) => ({
        ledgerLineId: ledger.id,
        date: ledger.date.toISOString().slice(0, 10),
        description: ledger.description,
        amount: ledger.amount,
        daysApart: Math.abs(ledger.date.getTime() - bank.date.getTime()) / DAY_MS,
      }))
      .filter((candidate) => candidate.daysApart <= MAX_DAYS)
      .sort(
        (a, b) =>
          a.daysApart - b.daysApart ||
          a.date.localeCompare(b.date) ||
          a.ledgerLineId.localeCompare(b.ledgerLineId),
      );
    for (const candidate of candidates) {
      reverseCounts.set(candidate.ledgerLineId, (reverseCounts.get(candidate.ledgerLineId) ?? 0) + 1);
    }
    return { bank, candidates };
  });
  const items = matches.map(({ bank, candidates }) => {
    const unique = candidates.length === 1 && reverseCounts.get(candidates[0].ledgerLineId) === 1;
    const status = !candidates.length ? 'NO_MATCH' : unique ? 'UNIQUE' : 'AMBIGUOUS';
    return {
      bankLineId: bank.id,
      date: bank.date.toISOString().slice(0, 10),
      amount: bank.amount,
      description: bank.description,
      status,
      candidateCount: candidates.length,
      candidates: candidates.slice(0, MAX_DISPLAYED),
      hasMoreCandidates: candidates.length > MAX_DISPLAYED,
    };
  });
  return {
    statementId: snapshot.statementId,
    maxDaysDifference: MAX_DAYS,
    total: items.length,
    unique: items.filter((item) => item.status === 'UNIQUE').length,
    ambiguous: items.filter((item) => item.status === 'AMBIGUOUS').length,
    noMatch: items.filter((item) => item.status === 'NO_MATCH').length,
    items,
  };
}
