import { SuccessMessage } from '../../../infrastructure/http/success-message.interceptor';
import { Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { OrdersService } from '../application/orders.service';

@ApiTags('Commandes de vente')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller('sales-orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @RequirePermissions('sales.read')
  list(@CurrentUserId() actorId: string) {
    return this.orders.list(actorId);
  }

  @Get(':id')
  @RequirePermissions('sales.read')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string) {
    return this.orders.get(id, actorId);
  }

  @Post(':id/cancel')
  @RequirePermissions('sales.manage')
  @SuccessMessage('Commande annulée.') cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string) {
    return this.orders.cancel(id, actorId);
  }

  @Post(':id/confirm')
  @RequirePermissions('sales.manage')
  @SuccessMessage('Commande confirmée et stock réservé.') confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string) {
    return this.orders.confirm(id, actorId);
  }

  @Post('from-proforma/:id')
  @RequirePermissions('sales.manage')
  @SuccessMessage('Commande créée à partir de la proforma.') convert(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string) {
    return this.orders.convert(id, actorId);
  }
}
