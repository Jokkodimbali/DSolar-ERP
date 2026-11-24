export const AUTH_RATE_LIMIT = Symbol('AUTH_RATE_LIMIT');

export interface AuthRateLimit {
  consume(key: string, limit: number): Promise<boolean>;
}
