import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AccessGuard, REQUIRED_PERMISSIONS } from '../../identity/presentation/access.guard';
import { OrdersController } from './orders.controller';
import { InvoicesController } from './invoices.controller';
import { CreditNotesController } from './credit-notes.controller';

describe('Sales financial API authorization', () => {
  const policies = [
    {
      controller: OrdersController,
      read: ['list', 'get'],
      manage: ['cancel', 'confirm', 'convert'],
    },
    {
      controller: InvoicesController,
      read: ['list', 'get'],
      manage: ['createFromOrder', 'issue', 'cancel'],
    },
    {
      controller: CreditNotesController,
      read: ['list'],
      manage: ['issue'],
    },
  ] as const;

  it.each(policies)('requires AccessGuard on $controller.name', ({ controller }) => {
    expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toContain(AccessGuard);
  });

  for (const policy of policies) {
    for (const method of policy.read) {
      it(`${policy.controller.name}.${method} requires sales.read`, () => {
        const handler = (policy.controller.prototype as unknown as Record<string, () => unknown>)[method];
        expect(Reflect.getMetadata(REQUIRED_PERMISSIONS, handler)).toEqual(['sales.read']);
      });
    }
    for (const method of policy.manage) {
      it(`${policy.controller.name}.${method} requires sales.manage`, () => {
        const handler = policy.controller.prototype[method] as () => unknown;
        expect(Reflect.getMetadata(REQUIRED_PERMISSIONS, handler)).toEqual(['sales.manage']);
      });
    }
  }
});
