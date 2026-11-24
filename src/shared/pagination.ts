export interface ListCriteria {
  page?: number;
  limit?: number;
  search?: string;
}
export interface Page<T> {
  items: T[];
  pagination: { page: number; limit: number; total: number; pages: number };
}
export function pageBounds(query: ListCriteria) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 25;
  if (!Number.isInteger(page) || page < 1 || page > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new RangeError('Pagination invalide.');
  return { page, limit, skip: (page - 1) * limit };
}
export function pageResult<T>(items: T[], total: number, page: number, limit: number): Page<T> {
  return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}
