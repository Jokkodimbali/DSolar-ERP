import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { DeliveriesRepository } from '../application/deliveries.port';

@Injectable()
export class PrismaDeliveriesRepository implements DeliveriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(orderId: string, actorId: string) {
    return this.prisma.deliveryNote.findMany({
      where: {
        orderId,
        order: {
          lines: {
            some: {},
            every: { store: { userAccess: { some: { userId: actorId } } } },
          },
        },
      },
      include: { lines: true },
      orderBy: { number: 'desc' },
    });
  }

  find(orderId: string, deliveryId: string, actorId: string) {
    return this.prisma.deliveryNote.findFirst({
      where: {
        id: deliveryId,
        orderId,
        order: {
          lines: {
            some: {},
            every: { store: { userAccess: { some: { userId: actorId } } } },
          },
        },
      },
      include: { lines: true },
    });
  }
}
