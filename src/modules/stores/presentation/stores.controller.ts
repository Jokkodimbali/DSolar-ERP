import { SuccessMessage } from '../../../infrastructure/http/success-message.interceptor';
import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { StoreAccessUseCases } from '../application/store-access.use-cases';
import { StoresUseCases } from '../application/stores.use-cases';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
@ApiTags('Magasins')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller('stores')
export class StoresController {
  constructor(
    private readonly useCases: StoresUseCases,
    private readonly access: StoreAccessUseCases,
  ) {}
  @Get() @RequirePermissions('stores.read') list(@CurrentUserId() userId: string) {
    return this.access.listVisible(userId);
  }
  @Get('mine') @RequirePermissions('stores.read') mine(@CurrentUserId() userId: string) {
    return this.access.listForUser(userId);
  }
  @Post(':id/users/:userId')
  @RequirePermissions('stores.manage')
  @SuccessMessage('Accès au magasin accordé.')
  grant(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @CurrentUserId() actorId: string,
  ) {
    return this.access.grant(id, userId, actorId);
  }
  @Delete(':id/users/:userId')
  @RequirePermissions('stores.manage')
  @SuccessMessage('Accès au magasin retiré.')
  revoke(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @CurrentUserId() actorId: string,
  ) {
    return this.access.revoke(id, userId, actorId);
  }
  @Get(':id') @RequirePermissions('stores.read') get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUserId() userId: string,
  ) {
    return this.access.getAccessible(id, userId);
  }
  @Post() @RequirePermissions('stores.manage') @SuccessMessage('Magasin créé.') create(
    @Body() dto: CreateStoreDto,
    @CurrentUserId() actorId: string,
  ) {
    return this.useCases.create(dto, actorId);
  }
  @Patch(':id')
  @RequirePermissions('stores.manage')
  @SuccessMessage('Informations du magasin mises à jour.')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateStoreDto,
    @CurrentUserId() actorId: string,
  ) {
    return this.useCases.update(id, dto, actorId);
  }
  @Patch(':id/activate') @RequirePermissions('stores.manage') @SuccessMessage('Magasin activé.') activate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUserId() actorId: string,
  ) {
    return this.useCases.setStatus(id, 'ACTIVE', actorId);
  }
  @Patch(':id/deactivate')
  @RequirePermissions('stores.manage')
  @SuccessMessage('Magasin désactivé.')
  deactivate(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUserId() actorId: string) {
    return this.useCases.setStatus(id, 'INACTIVE', actorId);
  }
}
