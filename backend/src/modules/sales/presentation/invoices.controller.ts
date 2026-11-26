import { SuccessMessage } from '../../../infrastructure/http/success-message.interceptor';
import { Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { InvoicesService } from '../application/invoices.service';

@ApiTags('Factures')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  @RequirePermissions('sales.read')
  list(@CurrentUserId() actorId: string) {
    return this.invoices.list(actorId);
  }

  @Get(':id')
  @RequirePermissions('sales.read')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string) {
    return this.invoices.get(id, actorId);
  }

  @Post('from-order/:orderId')
  @RequirePermissions('sales.manage')
  @SuccessMessage('Facture créée à partir de la commande.')
  createFromOrder(@Param('orderId', ParseUUIDPipe) orderId: string, @CurrentUserId() actorId: string) {
    return this.invoices.createFromOrder(orderId, actorId);
  }

  @Post(':id/issue')
  @RequirePermissions('sales.manage')
  @SuccessMessage('Facture émise avec succès.')
  issue(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string) {
    return this.invoices.issue(id, actorId);
  }

  @Post(':id/cancel')
  @RequirePermissions('sales.manage')
  @SuccessMessage('Facture annulée.')
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string) {
    return this.invoices.cancel(id, actorId);
  }
}
