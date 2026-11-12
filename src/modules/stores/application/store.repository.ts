import { NewStore, Store } from '../domain/store';
export const STORE_REPOSITORY = Symbol('STORE_REPOSITORY');
export interface StoreRepository {
  findAll(): Promise<Store[]>;
  findById(id: string): Promise<Store | null>;
  findByCode(code: string): Promise<Store | null>;
  create(input: NewStore): Promise<Store>;
  update(id: string, input: { name?: string; address?: string | null }): Promise<Store>;
  setStatus(id: string, status: 'ACTIVE' | 'INACTIVE'): Promise<Store>;
}
