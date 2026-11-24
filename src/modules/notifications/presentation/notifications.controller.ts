import { Controller, Get, Headers, Param, ParseUUIDPipe, Post, Sse, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessGuard } from '../../identity/presentation/access.guard';
import { AuthenticatedOnly } from '../../identity/presentation/route-policy';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { NotificationsService } from '../application/notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @AuthenticatedOnly()
  list(@CurrentUserId() actorId: string) { return this.service.feed(actorId); }

  @Sse('stream')
  @AuthenticatedOnly()
  stream(@CurrentUserId() actorId: string, @Headers('authorization') header: string) {
    return this.service.stream(actorId, header);
  }

  @Post('read-all')
  @AuthenticatedOnly()
  readAll(@CurrentUserId() actorId: string) { return this.service.mark(actorId); }

  @Post(':id/read')
  @AuthenticatedOnly()
  read(@CurrentUserId() actorId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.mark(actorId, id);
  }
}
