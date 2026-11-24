import { Controller, Get, Param, ParseUUIDPipe, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { SalesDocumentsService } from '../application/sales-documents.service';

@ApiTags('Documents commerciaux')
@ApiBearerAuth()
@ApiProduces('application/pdf')
@UseGuards(AccessGuard)
@RequirePermissions('sales.read')
@Controller()
export class SalesDocumentsController {
  constructor(private readonly service: SalesDocumentsService) {}

  @Get('proformas/:id/pdf')
  async proforma(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string) {
    return new StreamableFile(await this.service.download('PROFORMA', id, actorId), {
      type: 'application/pdf', disposition: 'attachment; filename="proforma-' + id + '.pdf"',
    });
  }

  @Get('invoices/:id/pdf')
  async invoice(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string) {
    return new StreamableFile(await this.service.download('INVOICE', id, actorId), {
      type: 'application/pdf', disposition: 'attachment; filename="facture-' + id + '.pdf"',
    });
  }
}
