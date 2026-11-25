import { describe, expect, it } from 'vitest';
import { accessInput, parseUsers } from './users.contract';

const id = 'c31ac59c-8148-4664-8745-496a9618f202';
const user = {
  id,
  email: 'test@example.test',
  nomComplet: 'Compte de test',
  permissions: ['stores.read'],
  magasinsAutorises: [id],
  status: 'ACTIVE',
  roleCodes: ['MAGASINIER'],
};

describe('Contrat utilisateur', () => {
  it('conserve le statut et le rôle retournés par le serveur', () => {
    expect(parseUsers([user])[0]).toMatchObject({ role: 'MAGASINIER', status: 'ACTIVE' });
    expect(parseUsers([{ ...user, status: 'DISABLED' }])[0]?.status).toBe('DISABLED');
  });

  it('rejette les anciens rôles, statuts et identifiants invalides', () => {
    expect(() => parseUsers([{ ...user, roleCodes: ['COMMERCIAL'] }])).toThrow();
    expect(() => parseUsers([{ ...user, roleCodes: ['ADMIN', 'MAGASINIER'] }])).toThrow();
    expect(() => parseUsers([{ ...user, status: 'UNKNOWN' }])).toThrow();
    expect(() => parseUsers([{ ...user, id: 'incorrect' }])).toThrow();
    expect(accessInput('MAGASINIER', [id, id])).toEqual({ roleCodes: ['MAGASINIER'], storeIds: [id] });
  });
});
