import { Component, ChangeDetectionStrategy, inject, signal, viewChild } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { GlobalSearchComponent } from '../features/search/presentation/global-search.component';
import { NotificationsComponent } from '../features/notifications/presentation/notifications.component';
import { UiIconComponent } from '../shared/ui/ui-icon.component';
import { DismissOutsideDirective } from '../shared/ui/dismiss-outside.directive';
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
    DismissOutsideDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <div class="workspace" [class.menu-open]="menuOpen()" [class.sidebar-collapsed]="collapsed()">
    <aside
      class="sidebar"
      aria-label="Navigation principale"
      id="main-navigation"
      [appDismissOutside]="menuOpen()"
      dismissExceptions="[data-menu-trigger]"
      (dismissed)="dismissNavigation($event, menuTrigger)"
    >
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
          <a
            routerLink="/ventes/proformas"
            routerLinkActive="active"
            (click)="menuOpen.set(false)"
            aria-label="Devis proforma"
            ><app-ui-icon name="cart" /><span class="nav-text">Devis proforma</span></a
          >
          <a
            routerLink="/ventes/factures"
            routerLinkActive="active"
            (click)="menuOpen.set(false)"
            aria-label="Factures"
            ><app-ui-icon name="cart" /><span class="nav-text">Factures</span></a
          >
          <a
            routerLink="/ventes/avoirs"
            routerLinkActive="active"
            (click)="menuOpen.set(false)"
            aria-label="Avoirs clients"
            ><app-ui-icon name="cart" /><span class="nav-text">Avoirs clients</span></a
          >
          <a
            routerLink="/ventes/clients"
            routerLinkActive="active"
            (click)="menuOpen.set(false)"
            aria-label="Clients"
            ><app-ui-icon name="user" /><span class="nav-text">Clients</span></a
          >
        }
        @if (session.can('products.read')) {
          <a
            routerLink="/produits"
            routerLinkActive="active"
            (click)="menuOpen.set(false)"
            aria-label="Produits"
          >
            <app-ui-icon name="layers" /><span class="nav-text">Produits</span>
          </a>
        }
        @if (session.can('stores.read', 'inventory.read')) {
          <a routerLink="/stocks" routerLinkActive="active" (click)="menuOpen.set(false)" aria-label="Stocks"
            ><app-ui-icon name="box" /><span class="nav-text">Stocks</span></a
          >
        }
        @if (session.can('inventory.read')) {
          <a
            routerLink="/approvisionnements/fournisseurs"
            routerLinkActive="active"
            (click)="menuOpen.set(false)"
            aria-label="Fournisseurs"
            ><app-ui-icon name="box" /><span class="nav-text">Fournisseurs</span></a
          >
          <a
            routerLink="/approvisionnements/commandes"
            routerLinkActive="active"
            (click)="menuOpen.set(false)"
            aria-label="Commandes fournisseurs"
            ><app-ui-icon name="box" /><span class="nav-text">Commandes fournisseurs</span></a
          >
          <a
            routerLink="/approvisionnements/receptions"
            routerLinkActive="active"
            (click)="menuOpen.set(false)"
            aria-label="Réceptions"
            ><app-ui-icon name="box" /><span class="nav-text">Réceptions</span></a
          >
        }
        @if (session.can('users.manage', 'inventory.read')) {
          <a
            routerLink="/approvisionnements/retours"
            routerLinkActive="active"
            (click)="menuOpen.set(false)"
            aria-label="Retours fournisseurs"
            ><app-ui-icon name="box" /><span class="nav-text">Retours fournisseurs</span></a
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
        @if (session.can('users.manage', 'sales.read')) {
          <a
            routerLink="/tresorerie"
            routerLinkActive="active"
            (click)="menuOpen.set(false)"
            aria-label="Trésorerie"
            ><app-ui-icon name="cart" /><span class="nav-text">Trésorerie</span></a
          >
          <a
            routerLink="/depenses"
            routerLinkActive="active"
            (click)="menuOpen.set(false)"
            aria-label="Dépenses"
            ><app-ui-icon name="cart" /><span class="nav-text">Dépenses</span></a
          >
        }
        @if (session.can('users.manage')) {
          <a
            routerLink="/utilisateurs"
            routerLinkActive="active"
            (click)="menuOpen.set(false)"
            aria-label="Utilisateurs"
          >
            <app-ui-icon name="user" /><span class="nav-text">Utilisateurs</span>
          </a>
        }
        <button
          type="button"
          class="sidebar-notifications"
          data-notification-trigger
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
          #menuTrigger
          data-menu-trigger
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
          <details
            #account
            class="account-menu"
            [appDismissOutside]="accountOpen()"
            (toggle)="accountOpen.set(account.open)"
            (dismissed)="dismissAccount($event, account)"
          >
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
          <a routerLink="/stocks" routerLinkActive="active" (click)="menuOpen.set(false)" aria-label="Stocks"
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
  readonly accountOpen = signal(false);

  dismissNavigation(reason: 'outside' | 'escape', trigger: HTMLButtonElement): void {
    this.menuOpen.set(false);
    if (reason === 'escape') trigger.focus();
  }

  dismissAccount(reason: 'outside' | 'escape', account: HTMLDetailsElement): void {
    account.open = false;
    this.accountOpen.set(false);
    if (reason === 'escape') account.querySelector('summary')?.focus();
  }
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
