import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AccessGuard, REQUIRED_PERMISSIONS } from '../../identity/presentation/access.guard';
import { DeliveriesController } from './deliveries.controller';
import { ProformasController } from './proformas.controller';

describe('Delivery and proforma endpoint permissions', () => {
  const policies: Array<{
    controller: { prototype: object; name: string };
    read: string[];
    manage: string[];
  }> = [
    {
      controller: DeliveriesController,
      read: ['list', 'get'],
      manage: ['create', 'confirm', 'cancel'],
    },
    {
      controller: ProformasController,
      read: ['list', 'get'],
      manage: ['create', 'update', 'issue', 'accept', 'cancel', 'expire'],
    },
  ];

  for (const { controller, read, manage } of policies) {
    it(`${controller.name} is guarded`, () => {
      expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toContain(AccessGuard);
    });
    for (const [methods, permission] of [
      [read, 'sales.read'],
      [manage, 'sales.manage'],
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
