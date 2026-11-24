import { SetMetadata } from '@nestjs/common';

export const PUBLIC_ROUTE = 'dsolar.public_route';
export const AUTHENTICATED_ONLY = 'dsolar.authenticated_only';

export const PublicRoute = () => SetMetadata(PUBLIC_ROUTE, true);
export const AuthenticatedOnly = () => SetMetadata(AUTHENTICATED_ONLY, true);

export const INTERNAL_PERMISSIONS = [
  'users.manage',
  'stores.read',
  'stores.manage',
  'products.read',
  'products.manage',
  'inventory.read',
  'inventory.manage',
  'sales.read',
  'sales.manage',
] as const;
