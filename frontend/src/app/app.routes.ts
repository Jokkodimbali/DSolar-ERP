import type { Routes } from '@angular/router';
import {
  authenticatedGuard,
  guestGuard,
  dashboardGuard,
  storesGuard,
  saleCreationGuard,
} from './features/auth/application/auth.guards';
export const routes: Routes = [
  {
    path: 'connexion',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/presentation/login.page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authenticatedGuard],
    canActivateChild: [authenticatedGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./layout/home.page').then((m) => m.HomePage),
      },
      {
        path: 'tableau-de-bord',
        canActivate: [dashboardGuard],
        loadComponent: () =>
          import('./features/dashboard/presentation/dashboard.page').then((m) => m.DashboardPage),
      },
      {
        path: 'magasins',
        canActivate: [storesGuard],
        loadComponent: () => import('./features/stores/presentation/stores.page').then((m) => m.StoresPage),
      },
      {
        path: 'ventes/nouvelle',
        canActivate: [saleCreationGuard],
        loadComponent: () => import('./features/sales/presentation/new-sale.page').then((m) => m.NewSalePage),
      },
      {
        path: 'mon-compte',
        loadComponent: () => import('./features/auth/presentation/profile.page').then((m) => m.ProfilePage),
      },
      {
        path: 'acces-refuse',
        loadComponent: () => import('./layout/forbidden.page').then((m) => m.ForbiddenPage),
      },
      { path: '**', redirectTo: '' },
    ],
  },
];
