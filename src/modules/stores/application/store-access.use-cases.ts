import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { STORE_REPOSITORY, StoreRepository } from './store.repository';
import { STORE_ACCESS_REPOSITORY, StoreAccessRepository } from './store-access.repository';
@Injectable()
export class StoreAccessUseCases {
  constructor(
    @Inject(STORE_REPOSITORY) private readonly stores: StoreRepository,
    @Inject(STORE_ACCESS_REPOSITORY) private readonly access: StoreAccessRepository,
  ) {}
  async grant(storeId: string, userId: string): Promise<{ storeId: string; userId: string; assigned: true }> {
    const store = await this.stores.findById(storeId);
    if (!store) throw new NotFoundException('Magasin introuvable.');
    if (store.status !== 'ACTIVE')
      throw new ConflictException('Impossible d’affecter un utilisateur à un magasin désactivé.');
    if (!(await this.access.userExists(userId)))
      throw new NotFoundException('Utilisateur actif introuvable.');
    await this.access.grant(userId, storeId);
    return { storeId, userId, assigned: true };
  }
  async revoke(
    storeId: string,
    userId: string,
  ): Promise<{ storeId: string; userId: string; assigned: false }> {
    if (!(await this.stores.findById(storeId))) throw new NotFoundException('Magasin introuvable.');
    await this.access.revoke(userId, storeId);
    return { storeId, userId, assigned: false };
  }
  async getAccessible(storeId: string, userId: string) {
    const store = await this.stores.findById(storeId);
    if (!store || store.status !== 'ACTIVE') throw new NotFoundException('Magasin introuvable ou désactivé.');
    if (!(await this.access.hasAccess(userId, storeId)))
      throw new ForbiddenException('Accès à ce magasin non autorisé.');
    return store;
  }
  async listForUser(userId: string) {
    const [stores, allowedIds] = await Promise.all([this.stores.findAll(), this.access.listStoreIds(userId)]);
    const allowed = new Set(allowedIds);
    return stores.filter((store) => allowed.has(store.id) && store.status === 'ACTIVE');
  }
}
