import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { CreateDeliveryDto } from './create-delivery.dto';
import { DeliveriesService } from '../application/deliveries.service';

@ApiTags('Bons de livraison')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller('sales-orders/:orderId/deliveries')
export class DeliveriesController {
  constructor(private readonly deliveries: DeliveriesService) {}

  @Post()
  @RequirePermissions('sales.manage')
  create(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentUserId() actorId: string,
    @Body() input: CreateDeliveryDto,
  ) {
    return this.deliveries.create(orderId, actorId, input);
  }

  @Post(':deliveryId/confirm')
  @RequirePermissions('sales.manage')
  confirm(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @CurrentUserId() actorId: string,
  ) {
    return this.deliveries.confirm(orderId, deliveryId, actorId);
  }

  @Post(':deliveryId/cancel')
  @RequirePermissions('sales.manage')
  cancel(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @CurrentUserId() actorId: string,
  ) {
    return this.deliveries.cancel(orderId, deliveryId, actorId);
  }

  @Get()
  @RequirePermissions('sales.read')
  list(@Param('orderId', ParseUUIDPipe) orderId: string, @CurrentUserId() actorId: string) {
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
