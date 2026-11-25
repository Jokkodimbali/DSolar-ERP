import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { SessionService } from './session.service';
export const authenticatedGuard: CanActivateFn = () =>
  inject(SessionService).authenticated() || inject(Router).createUrlTree(['/connexion']);
export const guestGuard: CanActivateFn = () =>
  !inject(SessionService).authenticated() || inject(Router).createUrlTree(['/']);
export const dashboardGuard: CanActivateFn = () =>
  inject(SessionService).can('sales.read', 'users.manage') || inject(Router).createUrlTree(['/acces-refuse']);
export const storesGuard: CanActivateFn = () =>
  inject(SessionService).can('stores.read') || inject(Router).createUrlTree(['/acces-refuse']);

export const saleCreationGuard: CanActivateFn = () =>
  inject(SessionService).can('sales.manage', 'sales.read', 'products.read', 'stores.read') ||
  inject(Router).createUrlTree(['/acces-refuse']);
