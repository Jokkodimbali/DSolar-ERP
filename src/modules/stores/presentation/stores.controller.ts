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
  @Get() @RequirePermissions('stores.read') list() {
    return this.useCases.list();
  }
  @Get('mine') @RequirePermissions('stores.read') mine(@CurrentUserId() userId: string) {
    return this.access.listForUser(userId);
  }
  @Post(':id/users/:userId') @RequirePermissions('stores.manage') grant(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.access.grant(id, userId);
  }
  @Delete(':id/users/:userId') @RequirePermissions('stores.manage') revoke(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.access.revoke(id, userId);
  }
  @Get(':id') @RequirePermissions('stores.read') get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUserId() userId: string,
  ) {
    return this.access.getAccessible(id, userId);
  }
  @Post() @RequirePermissions('stores.manage') create(@Body() dto: CreateStoreDto) {
    return this.useCases.create(dto);
  }
  @Patch(':id') @RequirePermissions('stores.manage') update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateStoreDto,
  ) {
    return this.useCases.update(id, dto);
  }
  @Patch(':id/activate') @RequirePermissions('stores.manage') activate(
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.useCases.setStatus(id, 'ACTIVE');
  }
  @Patch(':id/deactivate') @RequirePermissions('stores.manage') deactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.useCases.setStatus(id, 'INACTIVE');
  }
}
