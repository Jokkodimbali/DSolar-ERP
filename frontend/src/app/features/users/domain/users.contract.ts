import { isRecord } from '../../../core/api/api-contract';
import { parseIdentity, type PublicIdentity } from '../../auth/domain/auth.contract';
import { storeId } from '../../stores/domain/store.contract';

export type UserRole = 'ADMIN' | 'MAGASINIER';
export interface ManagedUser extends PublicIdentity {
  readonly status: 'ACTIVE' | 'DISABLED';
  readonly role: UserRole;
}

export interface UserAccess {
  readonly roleCodes: readonly UserRole[];
  readonly storeIds: readonly string[];
}

export function parseUsers(value: unknown): ManagedUser[] {
  if (!Array.isArray(value)) throw new Error('Liste des utilisateurs invalide.');
  return value.map((raw: unknown) => {
    if (
      !isRecord(raw) ||
      (raw['status'] !== 'ACTIVE' && raw['status'] !== 'DISABLED') ||
      !Array.isArray(raw['roleCodes']) ||
      raw['roleCodes'].length !== 1
    )
      throw new Error('Statut ou rôle utilisateur invalide.');
    const role: unknown = raw['roleCodes'][0];
    if (role !== 'ADMIN' && role !== 'MAGASINIER') throw new Error('Rôle utilisateur invalide.');
    const identity = parseIdentity(raw);
    return {
      ...identity,
      id: storeId(identity.id),
      magasinsAutorises: identity.magasinsAutorises.map(storeId),
      status: raw['status'],
      role,
    };
  });
}

export function accessInput(role: UserRole, stores: readonly string[]): UserAccess {
  if (role !== 'ADMIN' && role !== 'MAGASINIER') throw new Error('Rôle invalide.');
  return { roleCodes: [role], storeIds: [...new Set(stores.map(storeId))] };
}
