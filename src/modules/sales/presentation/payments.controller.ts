import { SuccessMessage } from '../../../infrastructure/http/success-message.interceptor';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { PaymentsService } from '../application/payments.service';
import { RecordPaymentDto } from './record-payment.dto';
import { ReversePaymentDto } from './reverse-payment.dto';
import { AllocatePaymentDto } from './allocate-payment.dto';

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

  @Get('summary')
  @RequirePermissions('sales.read')
  summary(@Param('orderId', ParseUUIDPipe) orderId: string, @CurrentUserId() actorId: string) {
    return this.payments.summary(orderId, actorId);
  }

  @Post()
  @RequirePermissions('sales.manage')
  @SuccessMessage('Règlement enregistré avec succès.') record(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentUserId() actorId: string,
    @Body() input: RecordPaymentDto,
  ) {
    return this.payments.record(orderId, actorId, input);
  }
  @Post(':paymentId/reverse')
  @RequirePermissions('sales.manage')
  @SuccessMessage('Règlement contrepassé.') reverse(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @CurrentUserId() actorId: string,
    @Body() input: ReversePaymentDto,
  ) {
    return this.payments.reverse(orderId, paymentId, actorId, input.reason);
  }
  @Post(':paymentId/allocations/:allocationId/cancel')
  @RequirePermissions('sales.manage')
  @SuccessMessage('Affectation du règlement annulée.') cancelAllocation(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Param('allocationId', ParseUUIDPipe) allocationId: string,
    @CurrentUserId() actorId: string,
    @Body() input: ReversePaymentDto,
  ) {
    return this.payments.cancelAllocation(orderId, paymentId, allocationId, actorId, input.reason);
  }
  @Post(':paymentId/allocations')
  @RequirePermissions('sales.manage')
  @SuccessMessage('Règlement affecté à la facture.') allocate(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @CurrentUserId() actorId: string,
    @Body() input: AllocatePaymentDto,
  ) {
    return this.payments.allocate(orderId, paymentId, input.invoiceId, actorId, input.amount);
  }
}
