import { Controller, Get, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { AuditService } from '../application/audit.service';

@ApiTags('Journal d’audit')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('users.manage')
  list(
    @CurrentUserId() actorId: string,
    @Query('limit') limit?: string,
    @Query('cursor', new ParseUUIDPipe({ optional: true })) cursor?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
    @Query('storeId', new ParseUUIDPipe({ optional: true })) storeId?: string,
  ) {
    return this.audit.list(actorId, { limit, cursor, entityType, entityId, action, storeId });
  }
}
