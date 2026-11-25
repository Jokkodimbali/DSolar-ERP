import { describe, expect, it } from 'vitest';
import { parseSearch, sources } from './search.contract';

describe('Recherche globale', () => {
  it('ne conserve que les informations utiles au résultat', () => {
    const source = sources.find((entry) => entry.label === 'Produits');
    if (!source) throw new Error('Source manquante.');
    const result = parseSearch({
      items: [{ id: 'id', name: 'Panneau', sku: 'PV-01', cost: '1000' }],
      pagination: { total: 1 },
    }, source);
    expect(result.items).toEqual([{ id: 'id', title: 'Panneau', subtitle: 'PV-01' }]);
    expect(() => parseSearch({ items: [], pagination: { total: -1 } }, source)).toThrow();
  });
});
