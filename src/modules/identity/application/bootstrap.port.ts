export const BOOTSTRAP_REPOSITORY = Symbol('BOOTSTRAP_REPOSITORY');
export interface BootstrapRepository {
  initialize(email: string, fullName: string, passwordHash: string): Promise<'created' | 'already_initialized'>;
}
