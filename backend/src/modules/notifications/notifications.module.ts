import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { NOTIFICATIONS } from './application/notifications.port';
import { NotificationsService } from './application/notifications.service';
import { PrismaNotificationsRepository } from './infrastructure/prisma-notifications.repository';
import { NotificationsController } from './presentation/notifications.controller';

@Module({
  imports: [PrismaModule, IdentityModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, { provide: NOTIFICATIONS, useClass: PrismaNotificationsRepository }],
})
export class NotificationsModule {}
