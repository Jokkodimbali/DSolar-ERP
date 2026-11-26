import { Prisma } from '@prisma/client';
import { SourceType } from '../domain/source-types';

export interface PendingSource {
  type: SourceType;
  id: string;
  date: Date | null;
}

// A single registry is shared by the reconciliation report, batch posting and closing.
export async function pendingSources(
  tx: Prisma.TransactionClient,
  start: Date,
  end: Date,
  limit: number,
): Promise<PendingSource[]> {
  return tx.$queryRaw<PendingSource[]>(Prisma.sql`
    SELECT type, id, date FROM "LedgerPendingSource"
    WHERE (date IS NULL OR (date >= ${start}::date AND date < (${end}::date + 1)))
    ORDER BY priority, date NULLS FIRST, type, id
    LIMIT ${limit}
  `);
}
