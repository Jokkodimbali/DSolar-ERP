import { pageBounds, pageResult } from './pagination';
describe('Pagination', () => {
  it('applique les limites par défaut', () => expect(pageBounds({})).toEqual({ page: 1, limit: 25, skip: 0 }));
  it('calcule les pages et le décalage', () => {
    expect(pageBounds({ page: 3, limit: 10 }).skip).toBe(20);
    expect(pageResult([], 21, 3, 10).pagination.pages).toBe(3);
  });
  it.each([0, -1, 101, 1.5])('refuse une taille de page invalide : %s', (limit) => {
    expect(() => pageBounds({ limit })).toThrow('Pagination invalide.');
  });
});
