import type { Routes } from '@angular/router';
import {
  authenticatedGuard,
  guestGuard,
  dashboardGuard,
  storesGuard,
  saleCreationGuard,
  ordersReadGuard,
  stockAlertsGuard,
  usersGuard,
  productsGuard,
  suppliersGuard,
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
        path: 'utilisateurs',
        canActivate: [usersGuard],
        loadComponent: () => import('./features/users/presentation/users.page').then((m) => m.UsersPage),
      },
      {
        path: 'produits',
        canActivate: [productsGuard],
        loadComponent: () =>
          import('./features/products/presentation/products.page').then((m) => m.ProductsPage),
      },
      {
        path: 'approvisionnements/fournisseurs',
        canActivate: [suppliersGuard],
        loadComponent: () =>
          import('./features/procurement/presentation/suppliers.page').then((m) => m.SuppliersPage),
      },
      {
        path: 'approvisionnements/commandes',
        canActivate: [suppliersGuard],
        loadComponent: () =>
          import('./features/procurement/presentation/purchase-orders.page').then(
            (m) => m.PurchaseOrdersPage,
          ),
      },
      {
        path: 'magasins',
        canActivate: [storesGuard],
        loadComponent: () => import('./features/stores/presentation/stores.page').then((m) => m.StoresPage),
      },
      {
        path: 'activite',
        canActivate: [dashboardGuard],
        loadComponent: () =>
          import('./features/dashboard/presentation/activity.page').then((m) => m.ActivityPage),
      },
      {
        path: 'stocks',
        canActivate: [stockAlertsGuard],
        loadComponent: () =>
          import('./features/inventory/presentation/inventory.page').then((m) => m.InventoryPage),
      },
      {
        path: 'stocks/transferts',
        canActivate: [stockAlertsGuard],
        data: { mode: 'transfers' },
        loadComponent: () =>
          import('./features/inventory/presentation/stock-workflows.page').then((m) => m.StockWorkflowsPage),
      },
      {
        path: 'stocks/inventaires',
        canActivate: [stockAlertsGuard],
        data: { mode: 'counts' },
        loadComponent: () =>
          import('./features/inventory/presentation/stock-workflows.page').then((m) => m.StockWorkflowsPage),
      },
      {
        path: 'stocks/alertes',
        canActivate: [stockAlertsGuard],
        loadComponent: () =>
          import('./features/dashboard/presentation/stock-alerts.page').then((m) => m.StockAlertsPage),
      },
      {
        path: 'ventes/commandes',
        canActivate: [ordersReadGuard],
        loadComponent: () => import('./features/sales/presentation/orders.page').then((m) => m.OrdersPage),
      },
      {
        path: 'ventes/commandes/:id',
        canActivate: [ordersReadGuard],
        loadComponent: () => import('./features/sales/presentation/orders.page').then((m) => m.OrdersPage),
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
