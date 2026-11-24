export interface IdentityUser {
  id: string;
  email: string;
  fullName: string;
  passwordHash: string;
  status: 'ACTIVE' | 'DISABLED';
  tokenVersion: number;
  permissions: string[];
  storeIds: string[];
}

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface PublicIdentity {
  id: string;
  email: string;
  nomComplet: string;
  permissions: string[];
  magasinsAutorises: string[];
}

export function toPublicIdentity(user: IdentityUser): PublicIdentity {
  return {
    id: user.id,
    email: user.email,
    nomComplet: user.fullName,
    permissions: user.permissions,
    magasinsAutorises: user.storeIds,
  };
}
