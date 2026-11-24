import { SuccessMessage } from '../../../infrastructure/http/success-message.interceptor';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { CreditNotesService } from '../application/credit-notes.service';
import { IssueCreditNoteDto } from './issue-credit-note.dto';

@ApiTags('Avoirs')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller('invoices/:invoiceId/credit-notes')
export class CreditNotesController {
  constructor(private readonly creditNotes: CreditNotesService) {}

  @Get()
  @RequirePermissions('sales.read')
  list(@Param('invoiceId', ParseUUIDPipe) invoiceId: string, @CurrentUserId() actorId: string) {
    return this.creditNotes.list(invoiceId, actorId);
  }

  @Post()
  @RequirePermissions('sales.manage')
  @SuccessMessage('Avoir client émis.')
  issue(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @CurrentUserId() actorId: string,
    @Body() input: IssueCreditNoteDto,
  ) {
    return this.creditNotes.issue(invoiceId, actorId, input.amount, input.reason, input.lines);
  }
}
