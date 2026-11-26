import { isRecord } from '../../../core/api/api-contract';
import { parsePage } from '../../inventory/domain/workflow.contract';
import { storeId } from '../../stores/domain/store.contract';

function invalid(): never {
  throw new Error('Données de caisse incohérentes.');
}
const record = (value: unknown) => (isRecord(value) ? value : invalid());
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : invalid());
const text = (value: unknown, max = 200) =>
  typeof value === 'string' && value.trim() && value.length <= max ? value : invalid();
function date(value: unknown) {
  const raw = text(value, 40);
  return Number.isFinite(Date.parse(raw)) ? raw : invalid();
}
const optionalDate = (value: unknown) => (value === null ? null : date(value));
const optionalId = (value: unknown) => (value === null ? null : storeId(value));
export function cashAmount(value: unknown, signed = false, aggregate = false): string {
  if (
    typeof value !== 'string' ||
    !(aggregate ? /^-?\d{1,40}(?:\.\d{1,2})?$/ : /^-?\d{1,16}(?:\.\d{1,2})?$/).test(value) ||
    (!signed && value.startsWith('-'))
  )
    return invalid();
  return value;
}
export function cents(value: string): bigint {
  const raw = cashAmount(value, true, true);
  const [whole = '0', fraction = ''] = raw.replace(/^-/, '').split('.');
  return (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))) * (raw.startsWith('-') ? -1n : 1n);
}
export function cashInput(value: string, signed = false, zero = false) {
  const result = cashAmount(value.trim().replace(',', '.'), signed);
  if (!zero && cents(result) === 0n) return invalid();
  return result;
}
function unique<T extends { id: string }>(items: T[]): T[] {
  if (new Set(items.map((item) => item.id)).size !== items.length) return invalid();
  return items;
}
export function parseRegister(value: unknown) {
  const row = record(value);
  return { id: storeId(row['id']), storeId: storeId(row['storeId']), name: text(row['name'], 100) };
}
export function parseSession(value: unknown, registerId: string) {
  const row = record(value);
  const closedAt = optionalDate(row['closedAt']);
  const counted = row['counted'] === null ? null : cashAmount(row['counted']);
  const expected = row['expected'] === null ? null : cashAmount(row['expected']);
  if (
    row['registerId'] !== registerId ||
    (closedAt !== null) !== (counted !== null) ||
    (closedAt !== null) !== (expected !== null)
  )
    return invalid();
  return {
    id: storeId(row['id']),
    registerId,
    opening: cashAmount(row['opening']),
    openedAt: date(row['openedAt']),
    closedAt,
    counted,
    expected,
  };
}
export type CashSession = ReturnType<typeof parseSession>;
export function parseRegisters(value: unknown) {
  return unique(
    array(value).map((raw) => {
      const row = record(raw);
      const register = parseRegister(row);
      const sessions = unique(array(row['sessions']).map((item) => parseSession(item, register.id)));
      const open = sessions.filter((session) => session.closedAt === null);
      if (open.length > 1) return invalid();
      return { ...register, open: open[0] ?? null };
    }),
  );
}
export type CashRegister = ReturnType<typeof parseRegisters>[number];
function checkedPage<T extends { id: string }>(value: unknown, parser: (item: unknown) => T) {
  const page = parsePage(value, parser);
  unique(page.items);
  if (page.items.length !== Math.min(page.limit, Math.max(0, page.total - (page.page - 1) * page.limit)))
    return invalid();
  return page;
}
export function parseSessionPage(value: unknown, registerId: string) {
  return checkedPage(value, (item) => parseSession(item, registerId));
}
export function parseSummary(value: unknown, sessionId: string) {
  const row = record(value);
  const opening = cashAmount(row['opening']);
  const entries = cashAmount(row['entries'], false, true);
  const exits = cashAmount(row['exits'], false, true);
  const expected = cashAmount(row['expected']);
  const counted = row['counted'] === null ? null : cashAmount(row['counted']);
  const difference = row['difference'] === null ? null : cashAmount(row['difference'], true);
  const closedAt = optionalDate(row['closedAt']);
  const movementCount = row['movementCount'];
  if (
    row['sessionId'] !== sessionId ||
    cents(opening) + cents(entries) - cents(exits) !== cents(expected) ||
    typeof movementCount !== 'number' ||
    !Number.isSafeInteger(movementCount) ||
    movementCount < 0 ||
    (closedAt !== null) !== (counted !== null) ||
    (closedAt !== null) !== (difference !== null) ||
    (counted !== null && difference !== null && cents(counted) - cents(expected) !== cents(difference))
  )
    return invalid();
  return { sessionId, opening, entries, exits, expected, counted, difference, closedAt, movementCount };
}
export type CashSummary = ReturnType<typeof parseSummary>;
export function parseMovement(value: unknown, sessionId: string) {
  const row = record(value);
  const amount = cashAmount(row['amount'], true);
  if (row['sessionId'] !== sessionId || cents(amount) === 0n) return invalid();
  return {
    id: storeId(row['id']),
    sessionId,
    amount,
    reason: text(row['reason']),
    operationKey: storeId(row['operationKey']),
    createdAt: date(row['createdAt']),
    transferKey: optionalId(row['transferKey']),
    reversalOfId: optionalId(row['reversalOfId']),
    paymentId: optionalId(row['paymentId']),
  };
}
export function parseMovementPage(value: unknown, sessionId: string) {
  return checkedPage(value, (raw) => {
    const row = record(raw);
    const movement = parseMovement(row, sessionId);
    const linked = ['reversal', 'expensePayment', 'expenseRefund'].some((key) => {
      if (row[key] === null) return false;
      storeId(record(row[key])['id']);
      return true;
    });
    return {
      ...movement,
      reversible: !linked && !movement.transferKey && !movement.reversalOfId && !movement.paymentId,
    };
  });
}
export type CashMovement = ReturnType<typeof parseMovementPage>['items'][number];
export function parseCandidates(value: unknown) {
  return checkedPage(value, (raw) => {
    const row = record(raw);
    const order = record(row['order']);
    return {
      id: storeId(row['id']),
      amount: cashInput(cashAmount(row['amount'])),
      receivedAt: date(row['receivedAt']),
      orderId: storeId(order['id']),
      orderNumber: text(order['number']),
    };
  });
}
export type CashCandidate = ReturnType<typeof parseCandidates>['items'][number];
export type CashCommand =
  | { kind: 'move'; sessionId: string; operationKey: string; amount: string; reason: string }
  | { kind: 'transfer'; sessionId: string; operationKey: string; amount: string; destinationId: string }
  | {
      kind: 'reverse';
      sessionId: string;
      operationKey: string;
      movementId: string;
      amount: string;
      reason: string;
    }
  | { kind: 'reconcile'; sessionId: string; operationKey: string; paymentId: string; amount: string };
export function parseCashCommand(value: unknown): CashCommand {
  const row = record(value);
  const common = { sessionId: storeId(row['sessionId']), operationKey: storeId(row['operationKey']) };
  const amount = cashInput(
    cashAmount(row['amount'], row['kind'] === 'move' || row['kind'] === 'reverse'),
    row['kind'] === 'move' || row['kind'] === 'reverse',
  );
  switch (row['kind']) {
    case 'move':
      return { ...common, kind: 'move', amount, reason: text(row['reason']).trim() };
    case 'transfer': {
      const destinationId = storeId(row['destinationId']);
      if (destinationId === common.sessionId) return invalid();
      return { ...common, kind: 'transfer', amount, destinationId };
    }
    case 'reverse':
      return {
        ...common,
        kind: 'reverse',
        amount,
        movementId: storeId(row['movementId']),
        reason: text(row['reason']).trim(),
      };
    case 'reconcile':
      return { ...common, kind: 'reconcile', amount, paymentId: storeId(row['paymentId']) };
    default:
      return invalid();
  }
}
export function verifyCashCommand(value: unknown, command: CashCommand) {
  const debit = parseMovement(
    command.kind === 'transfer' ? record(value)['debit'] : value,
    command.sessionId,
  );
  if (
    debit.operationKey !== command.operationKey ||
    cents(debit.amount) !== cents(command.amount) * (command.kind === 'transfer' ? -1n : 1n)
  )
    return invalid();
  switch (command.kind) {
    case 'transfer': {
      const credit = parseMovement(record(value)['credit'], command.destinationId);
      if (
        credit.transferKey !== command.operationKey ||
        debit.transferKey !== command.operationKey ||
        cents(credit.amount) !== cents(command.amount) ||
        credit.id === debit.id
      )
        return invalid();
      break;
    }
    case 'move':
      if (debit.reason !== command.reason || debit.transferKey || debit.reversalOfId || debit.paymentId)
        return invalid();
      break;
    case 'reverse':
      if (debit.reversalOfId !== command.movementId || debit.reason !== command.reason) return invalid();
      break;
    case 'reconcile':
      if (debit.paymentId !== command.paymentId) return invalid();
  }
  return debit;
}
export function cashStorageKey(actor: string) {
  return 'dsolar.cash.pending.v1:' + storeId(actor);
}
