import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { PaymentsService } from '../application/payments.service';
import { RecordPaymentDto } from './record-payment.dto';
import { ReversePaymentDto } from './reverse-payment.dto';

@ApiTags('Encaissements')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller('sales-orders/:orderId/payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @RequirePermissions('sales.read')
  list(@Param('orderId', ParseUUIDPipe) orderId: string, @CurrentUserId() actorId: string) {
    return this.payments.list(orderId, actorId);
  }

  @Post()
  @RequirePermissions('sales.manage')
  record(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentUserId() actorId: string,
    @Body() input: RecordPaymentDto,
  ) {
    return this.payments.record(orderId, actorId, input);
  }
  @Post(':paymentId/reverse')
  @RequirePermissions('sales.manage')
  reverse(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @CurrentUserId() actorId: string,
    @Body() input: ReversePaymentDto,
  ) {
    return this.payments.reverse(orderId, paymentId, actorId, input.reason);
  }
}
