import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PASSWORD_SERVICE, PasswordService } from './ports';
import { USER_MANAGEMENT_REPOSITORY, UserManagementRepository } from './user-management.port';
import { PublicIdentity } from '../domain/identity.types';

export interface CreateUserCommand {
  email: string;
  fullName: string;
  password: string;
  roleCodes: string[];
  storeIds: string[];
}
@Injectable()
export class UserManagementService {
  constructor(
    @Inject(USER_MANAGEMENT_REPOSITORY) private readonly users: UserManagementRepository,
    @Inject(PASSWORD_SERVICE) private readonly passwords: PasswordService,
  ) {}
  list(): Promise<PublicIdentity[]> {
    return this.users.list();
  }
  async create(command: CreateUserCommand): Promise<PublicIdentity> {
    const email = command.email.trim().toLowerCase();
    if (await this.users.emailExists(email))
      throw new ConflictException('Cette adresse e-mail est déjà utilisée.');
    await this.validateAccess(command.roleCodes, command.storeIds);
    const passwordHash = await this.passwords.hash(command.password);
    return this.users.create({
      email,
      fullName: command.fullName.trim(),
      passwordHash,
      roleCodes: [...new Set(command.roleCodes)],
      storeIds: [...new Set(command.storeIds)],
    });
  }
  async disable(id: string): Promise<void> {
    const result = await this.users.disableUnlessLastAdmin(id);
    if (result === 'not_found') throw new NotFoundException('Utilisateur introuvable.');
    if (result === 'last_admin')
      throw new ForbiddenException('Impossible de désactiver le dernier administrateur actif.');
  }
  async replaceAccess(id: string, roleCodes: string[], storeIds: string[]): Promise<PublicIdentity> {
    await this.validateAccess(roleCodes, storeIds);
    const result = await this.users.replaceAccessUnlessLastAdmin(
      id,
      [...new Set(roleCodes)],
      [...new Set(storeIds)],
    );
    if (result === 'last_admin')
      throw new ForbiddenException('Le dernier administrateur actif doit conserver son rôle.');
    if (!result) throw new NotFoundException('Utilisateur introuvable.');
    return result;
  }
  private async validateAccess(roles: string[], stores: string[]): Promise<void> {
    if (roles.length === 0 || !(await this.users.rolesExist([...new Set(roles)])))
      throw new BadRequestException('Un ou plusieurs rôles sont invalides.');
    if (!(await this.users.activeStoresExist([...new Set(stores)])))
      throw new BadRequestException('Un ou plusieurs magasins sont invalides ou inactifs.');
  }
}
