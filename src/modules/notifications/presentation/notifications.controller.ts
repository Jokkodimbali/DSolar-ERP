import { SuccessMessage } from '../../../infrastructure/http/success-message.interceptor';
import { Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, Sse, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../../infrastructure/http/page-query.dto';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessGuard } from '../../identity/presentation/access.guard';
import { AuthenticatedOnly } from '../../identity/presentation/route-policy';
import { CurrentUserId } from '../../identity/presentation/current-user.decorator';
import { NotificationsService } from '../application/notifications.service';

class NotificationQueryDto extends PageQueryDto {
  @IsOptional() @IsIn(['true', 'false']) read?: string;
  @IsOptional() @IsString() @MaxLength(80) action?: string;
  @IsOptional() @IsUUID() storeId?: string;
}

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @AuthenticatedOnly()
  list(@CurrentUserId() actorId: string, @Query() query: NotificationQueryDto) {
    const { read, ...filters } = query;
    return this.service.feed(actorId, { ...filters, read: read === undefined ? undefined : read === 'true' });
  }

  @Sse('stream')
  @AuthenticatedOnly()
  stream(@CurrentUserId() actorId: string, @Headers('authorization') header: string) {
    return this.service.stream(actorId, header);
  }

  @Post('read-all')
  @AuthenticatedOnly()
  @SuccessMessage('Toutes les notifications accessibles sont marquées comme lues.') readAll(@CurrentUserId() actorId: string) {
    return this.service.mark(actorId);
  }

  @Post(':id/read')
  @AuthenticatedOnly()
  @SuccessMessage('Notification marquée comme lue.') read(@CurrentUserId() actorId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.mark(actorId, id);
  }
}
