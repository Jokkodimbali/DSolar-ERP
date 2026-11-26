import { NewStore, Store } from '../domain/store';
export const STORE_REPOSITORY = Symbol('STORE_REPOSITORY');
export interface StoreRepository {
  findAll(): Promise<Store[]>;
  findById(id: string): Promise<Store | null>;
  findByCode(code: string): Promise<Store | null>;
  create(input: NewStore, actorId?: string): Promise<Store>;
  update(id: string, input: { name?: string; address?: string | null }, actorId?: string): Promise<Store>;
  setStatus(id: string, status: 'ACTIVE' | 'INACTIVE', actorId?: string): Promise<Store>;
}
