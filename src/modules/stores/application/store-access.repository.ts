export const STORE_ACCESS_REPOSITORY = Symbol('STORE_ACCESS_REPOSITORY');
export interface StoreAccessRepository {
  userExists(userId: string): Promise<boolean>;
  hasAccess(userId: string, storeId: string): Promise<boolean>;
  grant(userId: string, storeId: string): Promise<void>;
  revoke(userId: string, storeId: string): Promise<void>;
  listStoreIds(userId: string): Promise<string[]>;
}
