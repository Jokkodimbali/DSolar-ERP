import { Inject, Injectable } from '@nestjs/common';
import { BOOTSTRAP_REPOSITORY, BootstrapRepository } from './bootstrap.port';
import { PASSWORD_SERVICE, PasswordService } from './ports';
@Injectable()
export class BootstrapService {
  constructor(@Inject(BOOTSTRAP_REPOSITORY) private readonly repository: BootstrapRepository,
    @Inject(PASSWORD_SERVICE) private readonly passwords: PasswordService) {}
  async initialize(email: string, fullName: string, password: string): Promise<'created' | 'already_initialized'> {
    if (password.length < 12) throw new Error('Le mot de passe initial doit comporter au moins 12 caractères.');
    const hash = await this.passwords.hash(password);
    return this.repository.initialize(email.trim().toLowerCase(), fullName.trim(), hash);
  }
}
