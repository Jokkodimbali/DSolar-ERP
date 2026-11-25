import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AccessGuard, REQUIRED_PERMISSIONS } from '../../identity/presentation/access.guard';
import { InventoryController } from './inventory.controller';
import { StockCountController } from './stock-count.controller';
import { TransfersController } from './transfers.controller';

describe('Inventory and transfer API authorization', () => {
  const policies: Array<{
    controller: { prototype: object; name: string };
    read: string[];
    manage: string[];
  }> = [
    {
      controller: InventoryController,
      read: ['balance', 'listStoreStock', 'summary', 'alerts', 'movements'],
      manage: ['adjust'],
    },
    {
      controller: TransfersController,
      read: ['get', 'list'],
      manage: ['create', 'approve', 'ship', 'receive', 'cancel'],
    },
    { controller: StockCountController, read: ['get', 'list'], manage: ['start', 'record', 'cancel', 'validate'] },
  ];

  for (const { controller, read, manage } of policies) {
    it(`${controller.name} is protected by AccessGuard`, () => {
      expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toContain(AccessGuard);
    });

    for (const [methods, permission] of [
      [read, 'inventory.read'],
      [manage, 'inventory.manage'],
    ] as const) {
      for (const method of methods) {
        it(`${controller.name}.${method} requires ${permission}`, () => {
          const handler = (controller.prototype as Record<string, () => unknown>)[method];
          expect(typeof handler).toBe('function');
          expect(Reflect.getMetadata(REQUIRED_PERMISSIONS, handler)).toEqual([permission]);
        });
      }
    }
  }
});
