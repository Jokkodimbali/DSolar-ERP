import { HttpErrorResponse } from '@angular/common/http';
import { parseErrorMessage } from './api-contract';
export class RetryRequiredError extends Error {
  constructor() {
    super('Votre session a été renouvelée. Vérifiez l’état de l’opération avant de la confirmer à nouveau.');
  }
}
export function errorMessage(error: unknown): string {
  if (error instanceof RetryRequiredError) return error.message;
  if (error instanceof HttpErrorResponse) return parseErrorMessage(error.error as unknown, error.status);
  return 'Réponse du serveur inattendue. Réessayez ou contactez un administrateur.';
}
