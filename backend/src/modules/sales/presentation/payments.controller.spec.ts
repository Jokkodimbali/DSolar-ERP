import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AccessGuard, REQUIRED_PERMISSIONS } from '../../identity/presentation/access.guard';
import { PaymentsController } from './payments.controller';

describe('PaymentsController access policy', () => {
  it('protège le contrôleur avec AccessGuard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, PaymentsController)).toContain(AccessGuard);
  });

  it.each([
    ['list', 'sales.read'],
    ['record', 'sales.manage'],
    ['reverse', 'sales.manage'],
    ['allocate', 'sales.manage'],
    ['cancelAllocation', 'sales.manage'],
  ] as const)('exige %s pour %s', (method, permission) => {
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS, PaymentsController.prototype[method])).toEqual([
      permission,
    ]);
  });
});
