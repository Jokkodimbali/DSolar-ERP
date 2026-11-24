/** Validates the application JWT contract independently of signature verification. */
export function validSessionClaims(value: unknown, type: 'access' | 'refresh', now: number): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  const nonEmpty = (v: unknown): v is string =>
    typeof v === 'string' && v.length > 0 && v.length <= 128 && v.trim() === v;
  if (c.typ !== type || !nonEmpty(c.sub) || !nonEmpty(c.sid)) return false;
  if (
    typeof c.iat !== 'number' ||
    !Number.isSafeInteger(c.iat) ||
    typeof c.exp !== 'number' ||
    !Number.isSafeInteger(c.exp) ||
    c.iat <= 0 ||
    c.iat > now ||
    c.exp <= now ||
    c.exp <= c.iat ||
    c.exp - c.iat > (type === 'access' ? 900 : 604800)
  )
    return false;
  return type === 'access'
    ? typeof c.ver === 'number' && Number.isSafeInteger(c.ver) && c.ver >= 0
    : nonEmpty(c.jti);
}
