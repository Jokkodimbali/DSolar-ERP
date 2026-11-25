import { SuccessMessage } from '../../../infrastructure/http/success-message.interceptor';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { PageQueryDto } from '../../../infrastructure/http/page-query.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { TransfersService } from '../application/transfers.service';
import { CreateTransferDto } from './transfer.dto';
import { ReceiveTransferDto } from './receive-transfer.dto';
@ApiTags('Transferts de stock')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller('inventory/transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}
  @Post()
  @RequirePermissions('inventory.manage')
  @SuccessMessage('Transfert de stock créé.')
  create(@Body() dto: CreateTransferDto, @CurrentUserId() actorId: string) {
    return this.transfers.create({ ...dto, actorId });
  }
  @Get('stores/:storeId/search')
  @RequirePermissions('inventory.read')
  list(@Param('storeId', ParseUUIDPipe) storeId: string, @CurrentUserId() actorId: string, @Query() query: PageQueryDto) {
    return this.transfers.list(storeId, actorId, query);
  }

  @Get(':id')
  @RequirePermissions('inventory.read')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string) {
    return this.transfers.get(id, actorId);
  }
  @Post(':id/approve')
  @RequirePermissions('inventory.manage')
  @SuccessMessage('Transfert approuvé.')
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string) {
    return this.transfers.approve(id, actorId);
  }
  @Post(':id/ship')
  @RequirePermissions('inventory.manage')
  @SuccessMessage('Expédition du transfert enregistrée.')
  ship(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string) {
    return this.transfers.ship(id, actorId);
  }
  @Post(':id/receive')
  @RequirePermissions('inventory.manage')
  @SuccessMessage('Réception du transfert enregistrée.')
  receive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUserId() actorId: string,
    @Body() dto: ReceiveTransferDto,
  ) {
    return this.transfers.receive({ ...dto, id, actorId });
  }
  @Post(':id/cancel')
  @RequirePermissions('inventory.manage')
  @SuccessMessage('Transfert annulé.')
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string) {
    return this.transfers.cancel(id, actorId);
  }
}
