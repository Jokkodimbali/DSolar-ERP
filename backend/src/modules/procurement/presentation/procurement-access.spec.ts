import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AccessGuard, REQUIRED_PERMISSIONS } from '../../identity/presentation/access.guard';
import { SuppliersController } from './suppliers.controller';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { GoodsReceiptsController } from './goods-receipts.controller';

describe('Procurement endpoint authorization', () => {
  const policies: Array<{
    controller: { prototype: object; name: string };
    read: string[];
    manage: string[];
  }> = [
    { controller: SuppliersController, read: ['list', 'get'], manage: ['create', 'update', 'deactivate'] },
    { controller: PurchaseOrdersController, read: ['list', 'get'], manage: ['create', 'confirm', 'cancel'] },
    { controller: GoodsReceiptsController, read: ['list', 'get'], manage: ['create', 'confirm', 'cancel'] },
  ];

  for (const { controller, read, manage } of policies) {
    it(`${controller.name} uses AccessGuard`, () => {
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
