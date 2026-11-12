export const TRANSFER_REPOSITORY = Symbol('TRANSFER_REPOSITORY');
export interface TransferLineInput { productId: string; quantity: string; }
export interface CreateTransferInput {
  originId: string; destinationId: string; actorId: string;
  number: string; lines: TransferLineInput[];
}
export interface ReceiptLineInput {
  lineId: string;
  received: string;
  damaged: string;
  missing: string;
}
export interface ReceiveTransferInput {
  id: string;
  actorId: string;
  operationKey: string;
  lines: ReceiptLineInput[];
  finalize: boolean;
}
export interface TransferRepository {
  create(input: CreateTransferInput): Promise<unknown>;
  get(id: string, actorId: string): Promise<unknown>;
  approve(id: string, actorId: string): Promise<unknown>;
  ship(id: string, actorId: string): Promise<unknown>;
  receive(input: ReceiveTransferInput): Promise<unknown>;
  cancel(id: string, actorId: string): Promise<unknown>;
}
