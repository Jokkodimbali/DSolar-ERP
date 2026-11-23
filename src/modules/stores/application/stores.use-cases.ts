import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NewStore, Store } from '../domain/store';
import { STORE_REPOSITORY, StoreRepository } from './store.repository';
@Injectable()
export class StoresUseCases {
  constructor(@Inject(STORE_REPOSITORY) private readonly stores: StoreRepository) {}
  list(): Promise<Store[]> {
    return this.stores.findAll();
  }
  async get(id: string): Promise<Store> {
    const store = await this.stores.findById(id);
    if (!store) throw new NotFoundException('Magasin introuvable.');
    return store;
  }
  async create(input: NewStore, actorId?: string): Promise<Store> {
    const code = input.code.trim().toUpperCase();
    const name = input.name.trim();
    if (!code || !name) throw new BadRequestException('Le code et le nom sont obligatoires.');
    if (await this.stores.findByCode(code)) throw new ConflictException('Ce code magasin existe déjà.');
    return this.stores.create({ code, name, address: input.address?.trim() }, actorId);
  }
  async update(id: string, input: { name?: string; address?: string | null }, actorId?: string): Promise<Store> {
    await this.get(id);
    const name = input.name?.trim();
    if (input.name !== undefined && !name) throw new BadRequestException('Le nom est obligatoire.');
    const address = input.address === null ? null : input.address?.trim();
    return this.stores.update(id, {
      ...(name !== undefined ? { name } : {}),
      ...(input.address !== undefined ? { address } : {}),
    }, actorId);
  }
  async setStatus(id: string, status: 'ACTIVE' | 'INACTIVE', actorId?: string): Promise<Store> {
    const store = await this.get(id);
    if (store.status === status) return store;
    return this.stores.setStatus(id, status, actorId);
  }
}
