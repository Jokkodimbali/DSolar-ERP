import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { SupplierPurchasesService } from '../application/supplier-purchases.service';

@ApiTags('Achats fournisseurs')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@RequirePermissions('users.manage')
@Controller('suppliers')
export class SupplierPurchasesController {
  constructor(private readonly service: SupplierPurchasesService) {}

  @Get(':id/purchases-summary')
  summary(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string) {
    return this.service.summary(id, actorId);
  }
}
