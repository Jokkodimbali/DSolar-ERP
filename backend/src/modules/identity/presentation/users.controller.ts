import { SuccessMessage } from '../../../infrastructure/http/success-message.interceptor';
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserManagementService } from '../application/user-management.service';
import { AccessGuard, RequirePermissions } from './access.guard';
import { CurrentUserId } from './current-user.decorator';
import { CreateUserDto, ReplaceUserAccessDto } from './dto/manage-user.dto';
@ApiTags('Utilisateurs')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@RequirePermissions('users.manage')
@Controller('users')
export class UsersController {
  constructor(private readonly service: UserManagementService) {}
  @Get() list() {
    return this.service.list();
  }
  @Post() @SuccessMessage('Utilisateur créé avec succès.') create(
    @Body() dto: CreateUserDto,
    @CurrentUserId() actorId: string,
  ) {
    return this.service.create(dto, actorId);
  }
  @Patch(':id/disable') @SuccessMessage('Utilisateur désactivé.') disable(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUserId() actorId: string,
  ) {
    return this.service.disable(id, actorId);
  }
  @Patch(':id/access') @SuccessMessage('Autorisations de l’utilisateur mises à jour.') replaceAccess(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceUserAccessDto,
    @CurrentUserId() actorId: string,
  ) {
    return this.service.replaceAccess(id, dto.roleCodes, dto.storeIds, actorId);
  }
}
