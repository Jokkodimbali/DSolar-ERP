import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { AuditController } from './presentation/audit.controller';
import { AuditService } from './application/audit.service';
import { AuditRepository } from './infrastructure/audit.repository';

@Module({
  imports: [PrismaModule, IdentityModule],
  controllers: [AuditController],
  providers: [AuditService, AuditRepository],
})
export class AuditModule {}
