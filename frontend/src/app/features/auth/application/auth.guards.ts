import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { SessionService } from './session.service';
export const authenticatedGuard: CanActivateFn = () => inject(SessionService).authenticated() || inject(Router).createUrlTree(['/connexion']);
export const guestGuard: CanActivateFn = () => !inject(SessionService).authenticated() || inject(Router).createUrlTree(['/']);
export const dashboardGuard: CanActivateFn = () => inject(SessionService).can('sales.read','users.manage') || inject(Router).createUrlTree(['/acces-refuse']);
