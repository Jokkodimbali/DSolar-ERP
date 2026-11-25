import { Component, ChangeDetectionStrategy, inject, signal, viewChild } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { GlobalSearchComponent } from '../features/search/presentation/global-search.component';
import { NotificationsComponent } from '../features/notifications/presentation/notifications.component';
import { UiIconComponent } from '../shared/ui/ui-icon.component';
import { SessionService } from '../features/auth/application/session.service';
@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    UiIconComponent,
    NotificationsComponent,
    GlobalSearchComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <div class="workspace" [class.menu-open]="menuOpen()" [class.sidebar-collapsed]="collapsed()">
    <aside class="sidebar" aria-label="Navigation principale" id="main-navigation">
      <a class="brand" routerLink="/" (click)="menuOpen.set(false)"
        ><img class="company-logo" src="d-solar-and-agri.svg" width="245" height="160" alt="D-Solar and Agri"
      /></a>
      <button
        type="button"
        class="sidebar-collapse dashboard-icon-action"
        (click)="collapsed.set(!collapsed())"
        [attr.aria-expanded]="!collapsed()"
        aria-controls="main-navigation"
        [attr.aria-label]="collapsed() ? 'Développer le menu' : 'Réduire le menu'"
      >
        {{ collapsed() ? '»' : '«' }}
      </button>
      <nav>
        @if (!session.can('sales.read', 'users.manage')) {
          <a
            routerLink="/"
            routerLinkActive="active"
            [routerLinkActiveOptions]="{ exact: true }"
            (click)="menuOpen.set(false)"
            aria-label="Accueil"
            ><app-ui-icon name="home" /><span class="nav-text">Accueil</span></a
          >
        }
        @if (session.can('sales.read', 'users.manage')) {
          <a
            routerLink="/tableau-de-bord"
            routerLinkActive="active"
            (click)="menuOpen.set(false)"
            aria-label="Tableau de bord"
            ><app-ui-icon name="dashboard" /><span class="nav-text">Tableau de bord</span></a
          >
        }
        @if (session.can('sales.read')) {
          <a
            routerLink="/ventes/commandes"
            routerLinkActive="active"
            (click)="menuOpen.set(false)"
            aria-label="Ventes"
            ><app-ui-icon name="cart" /><span class="nav-text">Ventes</span></a
          >
        }
        @if (session.can('stores.read', 'inventory.read')) {
          <a
            routerLink="/stocks/alertes"
            routerLinkActive="active"
            (click)="menuOpen.set(false)"
            aria-label="Stocks"
            ><app-ui-icon name="box" /><span class="nav-text">Stocks</span></a
          >
        }
        @if (session.can('stores.read')) {
          <a
            routerLink="/magasins"
            routerLinkActive="active"
            (click)="menuOpen.set(false)"
            aria-label="Magasins"
            ><app-ui-icon name="store" /><span class="nav-text">Magasins</span></a
          >
        }
        <button
          type="button"
          class="sidebar-notifications"
          aria-label="Ouvrir les notifications"
          (click)="openNotifications()"
        >
          <app-ui-icon name="bell" /><span class="nav-text">Notifications</span>
        </button>
        <a
          routerLink="/mon-compte"
          routerLinkActive="active"
          (click)="menuOpen.set(false)"
          aria-label="Mon compte"
          ><app-ui-icon name="user" /><span class="nav-text">Mon compte</span></a
        >
      </nav>
      <div class="sidebar-footer">D-Solar and Agri<br /><small>Application interne</small></div>
    </aside>
    <div class="workspace-main">
      <header class="topbar">
        <button
          class="menu-toggle secondary"
          type="button"
          (click)="menuOpen.set(!menuOpen())"
          [attr.aria-expanded]="menuOpen()"
          aria-controls="main-navigation"
        >
          <app-ui-icon name="menu" /><span class="sr-only">Menu</span>
        </button>
        <span class="topbar-title"
          ><img
            class="mobile-company-logo"
            src="d-solar-and-agri.svg"
            width="245"
            height="160"
            alt="D-Solar and Agri"
          /><span class="desktop-brand">DSolar<span class="brand-accent">-ERP</span></span></span
        >
        <app-global-search />
        <div class="user-actions">
          @if (session.can('sales.manage', 'sales.read', 'products.read', 'stores.read')) {
            <a class="primary new-sale-action" routerLink="/ventes/nouvelle" (click)="menuOpen.set(false)"
              >+ Nouvelle vente</a
            >
          }
          <app-notifications />
          <details class="account-menu">
            <summary class="account-chip" aria-label="Menu du compte">
              <span class="account-avatar"><app-ui-icon name="user" /></span>
              <span class="account-label">
                <strong>{{ session.user()?.nomComplet }}</strong>
                <small>{{ session.can('users.manage') ? 'Administrateur' : 'Magasinier' }}</small>
              </span>
              <span class="account-chevron" aria-hidden="true">⌄</span>
            </summary>
            <div class="account-dropdown panel">
              <a routerLink="/mon-compte" (click)="closeAccount($event)">Mon compte</a>
              <button type="button" class="secondary" [disabled]="loggingOut()" (click)="logout()">
                Déconnexion
              </button>
            </div>
          </details>
        </div>
      </header>
      <main class="page"><router-outlet /></main>
      <nav class="mobile-nav" aria-label="Navigation rapide">
        <a
          routerLink="/"
          routerLinkActive="active"
          [routerLinkActiveOptions]="{ exact: true }"
          (click)="menuOpen.set(false)"
          aria-label="Accueil"
          ><app-ui-icon name="home" /><span class="nav-text">Accueil</span></a
        >
        @if (session.can('sales.read', 'users.manage')) {
          <a
            routerLink="/tableau-de-bord"
            routerLinkActive="active"
            (click)="menuOpen.set(false)"
            aria-label="Tableau de bord"
            ><app-ui-icon name="dashboard" /><span class="nav-text">Tableau de bord</span></a
          >
        }
        @if (session.can('sales.read')) {
          <a
            routerLink="/ventes/commandes"
            routerLinkActive="active"
            (click)="menuOpen.set(false)"
            aria-label="Ventes"
            ><app-ui-icon name="cart" /><span class="nav-text">Ventes</span></a
          >
        }
        @if (session.can('stores.read', 'inventory.read')) {
          <a
            routerLink="/stocks/alertes"
            routerLinkActive="active"
            (click)="menuOpen.set(false)"
            aria-label="Stocks"
            ><app-ui-icon name="box" /><span class="nav-text">Stocks</span></a
          >
        }
        @if (session.can('stores.read')) {
          <a
            routerLink="/magasins"
            routerLinkActive="active"
            (click)="menuOpen.set(false)"
            aria-label="Magasins"
            ><app-ui-icon name="store" /><span class="nav-text">Magasins</span></a
          >
        }
        <a
          routerLink="/mon-compte"
          routerLinkActive="active"
          (click)="menuOpen.set(false)"
          aria-label="Compte"
          ><app-ui-icon name="user" /><span class="nav-text">Compte</span></a
        >
      </nav>
    </div>
  </div>`,
})
export class Shell {
  readonly session = inject(SessionService);
  readonly menuOpen = signal(false);
  readonly collapsed = signal(false);
  private readonly notifications = viewChild(NotificationsComponent);

  openNotifications(): void {
    this.menuOpen.set(false);
    this.notifications()?.open.set(true);
  }
  readonly loggingOut = signal(false);
  closeAccount(event: Event): void {
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.closest('details')?.removeAttribute('open');
    }
  }

  logout(): void {
    if (this.loggingOut()) return;
    this.loggingOut.set(true);
    this.session.logout().subscribe({
      error: () => {
        this.loggingOut.set(false);
      },
      complete: () => this.loggingOut.set(false),
    });
  }
}
