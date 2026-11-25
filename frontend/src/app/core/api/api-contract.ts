export const API_PREFIX = '/api/v1';
export function apiPath(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('..') || path.includes('\\'))
    throw new Error('Chemin API invalide.');
  return API_PREFIX + path;
}
export function isInternalApi(url: string): boolean {
  return url.startsWith(API_PREFIX + '/') && !url.includes('\\') && !url.includes('..');
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === 'string');
}
export function parseErrorMessage(body: unknown, status: number): string {
  if (status === 0) return 'Connexion au serveur impossible. Vérifiez votre réseau.';
  if (status >= 500) return 'Service momentanément indisponible. Réessayez ultérieurement.';
  if (isRecord(body)) {
    const message = body['message'];
    if (typeof message === 'string' && message.trim()) return message;
    if (isStringArray(message) && message.length) return message.join(' ');
  }
  if (status === 401) return 'Session expirée ou identifiants invalides.';
  if (status === 403) return 'Vous ne disposez pas des autorisations nécessaires.';
  if (status === 409) return 'Conflit de données. Rechargez les informations avant de réessayer.';
  return 'La requête a été refusée. Vérifiez les données transmises.';
}
export function decodeSuccessMessage(value: string | null): string | null {
  if (!value) return null;
  try { return decodeURIComponent(value); } catch { return null; }
}
