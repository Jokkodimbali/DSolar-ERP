import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
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
  template: ` <div class="workspace" [class.menu-open]="menuOpen()">
    <aside class="sidebar" aria-label="Navigation principale">
      <a class="brand" routerLink="/" (click)="menuOpen.set(false)"
        ><img class="company-logo" src="d-solar-and-agri.svg" width="245" height="160" alt="D-Solar and Agri" /></a
      >
      <p class="nav-label">ESPACE DE TRAVAIL</p>
      <nav>
        <a
          routerLink="/"
          routerLinkActive="active"
          [routerLinkActiveOptions]="{ exact: true }"
          (click)="menuOpen.set(false)"
          ><app-ui-icon name="home" />Accueil</a
        >
        @if (session.can('sales.read', 'users.manage')) {
          <a routerLink="/tableau-de-bord" routerLinkActive="active" (click)="menuOpen.set(false)"
            ><app-ui-icon name="dashboard" />Tableau de bord</a
          >
        }
        @if (session.can('stores.read')) {
          <a routerLink="/magasins" routerLinkActive="active" (click)="menuOpen.set(false)"
            ><app-ui-icon name="store" />Magasins</a
          >
        }
        <a routerLink="/mon-compte" routerLinkActive="active" (click)="menuOpen.set(false)"
          ><app-ui-icon name="user" />Mon compte</a
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
        >
          <app-ui-icon name="menu" /><span class="sr-only">Menu</span>
        </button>
        <span class="topbar-title"><img class="mobile-company-logo" src="d-solar-and-agri.svg" width="245" height="160" alt="D-Solar and Agri" /><span class="desktop-brand">DSolar<span class="brand-accent">-ERP</span></span></span>
        <app-global-search />
        <div class="user-actions">
          <app-notifications />
          <a class="account-chip" routerLink="/mon-compte" aria-label="Mon compte"
            ><span class="account-avatar"><app-ui-icon name="user" /></span
            ><span>{{ session.user()?.nomComplet }}</span></a
          ><button type="button" class="secondary" [disabled]="loggingOut()" (click)="logout()">
            Déconnexion
          </button>
        </div>
      </header>
      <main class="page"><router-outlet /></main>
      <nav class="mobile-nav" aria-label="Navigation rapide">
        <a
          routerLink="/"
          routerLinkActive="active"
          [routerLinkActiveOptions]="{ exact: true }"
          (click)="menuOpen.set(false)"
          ><app-ui-icon name="home" />Accueil</a
        >
        @if (session.can('sales.read', 'users.manage')) {
          <a routerLink="/tableau-de-bord" routerLinkActive="active" (click)="menuOpen.set(false)"
            ><app-ui-icon name="dashboard" />Tableau de bord</a
          >
        }
        @if (session.can('stores.read')) {
          <a routerLink="/magasins" routerLinkActive="active" (click)="menuOpen.set(false)"
            ><app-ui-icon name="store" />Magasins</a
          >
        }
        <a routerLink="/mon-compte" routerLinkActive="active" (click)="menuOpen.set(false)"
          ><app-ui-icon name="user" />Compte</a
        >
      </nav>
    </div>
  </div>`,
})
export class Shell {
  readonly session = inject(SessionService);
  readonly menuOpen = signal(false);
  readonly loggingOut = signal(false);
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
