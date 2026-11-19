import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessGuard, RequirePermissions } from '../../identity/presentation/access.guard';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { StockCountService } from '../application/stock-count.service';
import { RecordCountDto } from './stock-count.dto';

@ApiTags('Inventaires physiques')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller('inventory/counts')
export class StockCountController {
  constructor(private readonly counts: StockCountService) {}

  @Post('stores/:storeId')
  @RequirePermissions('inventory.manage')
  start(@Param('storeId', ParseUUIDPipe) storeId: string, @CurrentUserId() actorId: string) {
    return this.counts.start(storeId, actorId);
  }

  @Get(':id')
  @RequirePermissions('inventory.read')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string) {
    return this.counts.get(id, actorId);
  }

  @Post(':id/lines')
  @RequirePermissions('inventory.manage')
  record(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordCountDto,
    @CurrentUserId() actorId: string,
  ) {
    return this.counts.record(id, actorId, dto.lines);
  }

  @Post(':id/validate')
  @RequirePermissions('inventory.manage')
  validate(@Param('id', ParseUUIDPipe) id: string, @CurrentUserId() actorId: string) {
    return this.counts.validate(id, actorId);
  }
}
