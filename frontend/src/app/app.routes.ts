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
  expensesGuard,
  productsGuard,
  suppliersGuard,
  supplierReturnsGuard,
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
        path: 'depenses',
        canActivate: [expensesGuard],
        loadComponent: () =>
          import('./features/expenses/presentation/expenses.page').then((m) => m.ExpensesPage),
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
        path: 'approvisionnements/receptions',
        canActivate: [suppliersGuard],
        loadComponent: () =>
          import('./features/procurement/presentation/goods-receipts.page').then((m) => m.GoodsReceiptsPage),
      },
      {
        path: 'approvisionnements/retours',
        canActivate: [supplierReturnsGuard],
        loadComponent: () =>
          import('./features/procurement/presentation/supplier-returns.page').then(
            (m) => m.SupplierReturnsPage,
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
        path: 'ventes/proformas',
        canActivate: [ordersReadGuard],
        loadComponent: () =>
          import('./features/sales/presentation/proformas.page').then((m) => m.ProformasPage),
      },
      {
        path: 'ventes/reglements/commande/:id/affectations',
        canActivate: [ordersReadGuard],
        loadComponent: () =>
          import('./features/sales/presentation/payment-allocations.page').then(
            (m) => m.PaymentAllocationsPage,
          ),
      },
      {
        path: 'ventes/reglements/commande/:id',
        canActivate: [ordersReadGuard],
        loadComponent: () =>
          import('./features/sales/presentation/order-payments.page').then((m) => m.OrderPaymentsPage),
      },
      {
        path: 'ventes/avoirs',
        canActivate: [ordersReadGuard],
        loadComponent: () =>
          import('./features/sales/presentation/credit-directory.page').then((m) => m.CreditDirectoryPage),
      },
      {
        path: 'ventes/factures/:id/avoirs',
        canActivate: [ordersReadGuard],
        loadComponent: () =>
          import('./features/sales/presentation/credit-notes.page').then((m) => m.CreditNotesPage),
      },
      {
        path: 'ventes/factures/commande/:id',
        canActivate: [ordersReadGuard],
        loadComponent: () =>
          import('./features/sales/presentation/invoices.page').then((m) => m.InvoicesPage),
      },
      {
        path: 'ventes/factures',
        canActivate: [ordersReadGuard],
        loadComponent: () =>
          import('./features/sales/presentation/invoices.page').then((m) => m.InvoicesPage),
      },
      {
        path: 'ventes/clients',
        canActivate: [ordersReadGuard],
        loadComponent: () =>
          import('./features/sales/presentation/customers.page').then((m) => m.CustomersPage),
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
        path: 'ventes/proformas/:id/modifier',
        canActivate: [saleCreationGuard],
        loadComponent: () => import('./features/sales/presentation/new-sale.page').then((m) => m.NewSalePage),
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
