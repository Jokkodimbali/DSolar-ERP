import { isRecord, isStringArray } from '../../../core/api/api-contract';
export const permissions = [
  'users.manage',
  'stores.read',
  'stores.manage',
  'products.read',
  'products.manage',
  'inventory.read',
  'inventory.manage',
  'sales.read',
  'sales.manage',
] as const;
export type Permission = (typeof permissions)[number];
export interface PublicIdentity {
  readonly id: string;
  readonly email: string;
  readonly nomComplet: string;
  readonly permissions: readonly string[];
  readonly magasinsAutorises: readonly string[];
}
export interface AuthResult {
  readonly jetonAcces: string;
  readonly jetonRenouvellement: string;
  readonly utilisateur: PublicIdentity;
}
export interface LoginInput {
  readonly email: string;
  readonly password: string;
}
export function parseIdentity(value: unknown): PublicIdentity {
  if (
    !isRecord(value) ||
    typeof value['id'] !== 'string' ||
    typeof value['email'] !== 'string' ||
    typeof value['nomComplet'] !== 'string' ||
    !isStringArray(value['permissions']) ||
    !isStringArray(value['magasinsAutorises'])
  )
    throw new Error('Identité invalide.');
  return {
    id: value['id'],
    email: value['email'],
    nomComplet: value['nomComplet'],
    permissions: [...value['permissions']],
    magasinsAutorises: [...value['magasinsAutorises']],
  };
}
export function parseAuthResult(value: unknown): AuthResult {
  if (
    !isRecord(value) ||
    typeof value['jetonAcces'] !== 'string' ||
    !value['jetonAcces'] ||
    typeof value['jetonRenouvellement'] !== 'string' ||
    !value['jetonRenouvellement']
  )
    throw new Error('Session invalide.');
  return {
    jetonAcces: value['jetonAcces'],
    jetonRenouvellement: value['jetonRenouvellement'],
    utilisateur: parseIdentity(value['utilisateur']),
  };
}
export function hasPermissions(user: PublicIdentity | null, required: readonly Permission[]): boolean {
  return user !== null && required.every((permission) => user.permissions.includes(permission));
}

export type BrowserAuthResult = Omit<AuthResult, 'jetonRenouvellement'>;

export function parseBrowserAuthResult(value: unknown): BrowserAuthResult {
  if (!isRecord(value) || typeof value['jetonAcces'] !== 'string' || !value['jetonAcces'])
    throw new Error('Session invalide.');
  return { jetonAcces: value['jetonAcces'], utilisateur: parseIdentity(value['utilisateur']) };
}
