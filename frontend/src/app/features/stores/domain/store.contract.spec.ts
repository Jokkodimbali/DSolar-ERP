import { describe, expect, it } from 'vitest';
import { filterStores, parseAssignment, parseStore, parseStores } from './store.contract';

const store = {
  id: 'c31ac59c-8148-4664-8745-496a9618f202',
  code: 'MAG-001',
  name: 'Dakar',
  address: null,
  status: 'ACTIVE',
  createdAt: '2026-11-25T12:00:00.000Z',
  updatedAt: '2026-11-25T12:00:00.000Z',
};

describe('Contrats magasins', () => {
  it('accepte les réponses du serveur et refuse les données incorrectes', () => {
    expect(parseStore(store)).toEqual(store);
    expect(parseStores([store])).toEqual([store]);
    expect(() => parseStore({ ...store, status: 'UNKNOWN' })).toThrow();
    expect(() => parseStore({ ...store, id: '../users' })).toThrow();
    expect(() => parseStore({ ...store, address: 12 })).toThrow();
    expect(() => parseStore({ ...store, updatedAt: 'invalid' })).toThrow();
    expect(() => parseStores(null)).toThrow();
  });

  it('filtre par code, nom et statut sans modifier la liste originale', () => {
    const stores = parseStores([store, { ...store, code: 'MAG-002', name: 'Thiès', status: 'INACTIVE' }]);
    expect(filterStores(stores, ' dakar ', 'ALL')).toHaveLength(1);
    expect(filterStores(stores, 'MAG-', 'INACTIVE')).toHaveLength(1);
    expect(filterStores(stores, 'inconnu', 'ALL')).toHaveLength(0);
    expect(stores).toHaveLength(2);
  });

  it('vérifie la confirmation de chaque affectation', () => {
    expect(() => parseAssignment({ storeId: store.id, userId: store.id, assigned: true }, store.id, store.id, true)).not.toThrow();
    expect(() => parseAssignment({ storeId: store.id, userId: store.id, assigned: false }, store.id, store.id, true)).toThrow();
  });
});
