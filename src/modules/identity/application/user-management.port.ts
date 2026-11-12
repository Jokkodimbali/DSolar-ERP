import { PublicIdentity } from '../domain/identity.types';
export const USER_MANAGEMENT_REPOSITORY = Symbol('USER_MANAGEMENT_REPOSITORY');
export interface CreateUserRecord { email: string; fullName: string; passwordHash: string; roleCodes: string[]; storeIds: string[]; }
export interface UserManagementRepository {
  list(): Promise<PublicIdentity[]>;
  create(input: CreateUserRecord): Promise<PublicIdentity>;
  disableUnlessLastAdmin(id: string): Promise<"disabled" | "not_found" | "last_admin">;
  replaceAccessUnlessLastAdmin(id: string, roleCodes: string[], storeIds: string[]): Promise<PublicIdentity | "last_admin" | null>;
  rolesExist(codes: string[]): Promise<boolean>;
  activeStoresExist(ids: string[]): Promise<boolean>;
  emailExists(email: string): Promise<boolean>;
}
