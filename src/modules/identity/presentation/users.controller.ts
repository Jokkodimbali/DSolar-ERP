import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserManagementService } from '../application/user-management.service';
import { AccessGuard, RequirePermissions } from './access.guard';
import { CreateUserDto, ReplaceUserAccessDto } from './dto/manage-user.dto';
@ApiTags('Utilisateurs') @ApiBearerAuth() @UseGuards(AccessGuard) @RequirePermissions('users.manage')
@Controller('users')
export class UsersController {
  constructor(private readonly service: UserManagementService) {}
  @Get() list() { return this.service.list(); }
  @Post() create(@Body() dto: CreateUserDto) { return this.service.create(dto); }
  @Patch(':id/disable') disable(@Param('id', ParseUUIDPipe) id: string) { return this.service.disable(id); }
  @Patch(':id/access') replaceAccess(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReplaceUserAccessDto) {
    return this.service.replaceAccess(id, dto.roleCodes, dto.storeIds);
  }
}
