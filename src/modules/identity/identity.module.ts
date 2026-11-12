import { BootstrapService } from './application/bootstrap.service';
import { BOOTSTRAP_REPOSITORY } from './application/bootstrap.port';
import { PrismaBootstrapRepository } from './infrastructure/prisma-bootstrap.repository';
import { UserManagementService } from './application/user-management.service';
import { USER_MANAGEMENT_REPOSITORY } from './application/user-management.port';
import { PrismaUserManagementRepository } from './infrastructure/prisma-user-management.repository';
import { UsersController } from './presentation/users.controller';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { AuthUseCases } from './application/auth.use-cases';
import { PASSWORD_SERVICE, SESSION_REPOSITORY, TOKEN_SERVICE, USER_REPOSITORY } from './application/ports';
import { ArgonPasswordService, JwtTokenService } from './infrastructure/crypto-services';
import { PrismaSessionRepository } from './infrastructure/prisma-session.repository';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository';
import { AccessGuard } from './presentation/access.guard';
import { AuthController } from './presentation/auth.controller';

@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [AuthController, UsersController],
  providers: [
    AuthUseCases,
    UserManagementService,
    BootstrapService,
    { provide: BOOTSTRAP_REPOSITORY, useClass: PrismaBootstrapRepository },
    AccessGuard,
    PrismaUserRepository,
    { provide: USER_MANAGEMENT_REPOSITORY, useClass: PrismaUserManagementRepository },
    { provide: USER_REPOSITORY, useExisting: PrismaUserRepository },
    { provide: SESSION_REPOSITORY, useClass: PrismaSessionRepository },
    { provide: PASSWORD_SERVICE, useClass: ArgonPasswordService },
    { provide: TOKEN_SERVICE, useClass: JwtTokenService },
  ],
  exports: [AccessGuard, USER_REPOSITORY, TOKEN_SERVICE, BootstrapService],
})
export class IdentityModule {}
