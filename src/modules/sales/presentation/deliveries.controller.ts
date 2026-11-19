import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { DeliveriesService } from '../application/deliveries.service';

@ApiTags('Bons de livraison')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller('sales-orders/:orderId/deliveries')
export class DeliveriesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Get()
  @RequirePermissions('sales.read')
  list(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentUserId() actorId: string,
  ) {
    return this.deliveries.list(orderId, actorId);
  }

  @Get(':deliveryId')
  @RequirePermissions('sales.read')
  get(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @CurrentUserId() actorId: string,
  ) {
    return this.deliveries.get(orderId, deliveryId, actorId);
  }
}
