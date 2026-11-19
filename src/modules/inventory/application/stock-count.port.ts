export const STOCK_COUNT_REPOSITORY = Symbol('STOCK_COUNT_REPOSITORY');

export interface CountLineInput {
  productId: string;
  counted: string;
  reason?: string;
}

export interface StockCountRepository {
  start(storeId: string, actorId: string): Promise<unknown>;
  get(id: string, actorId: string): Promise<unknown>;
  record(id: string, actorId: string, lines: CountLineInput[]): Promise<unknown>;
  validate(id: string, actorId: string): Promise<unknown>;
  cancel(id: string, actorId: string): Promise<unknown>;
}
