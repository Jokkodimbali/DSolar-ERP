import { HttpErrorResponse } from '@angular/common/http';
import { parseErrorMessage } from './api-contract';
export function errorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) return parseErrorMessage(error.error as unknown, error.status);
  return 'Réponse du serveur inattendue. Réessayez ou contactez un administrateur.';
}
