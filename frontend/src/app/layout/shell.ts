import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionService } from '../features/auth/application/session.service';
@Component({ selector: 'app-shell', imports: [RouterOutlet, RouterLink, RouterLinkActive], changeDetection: ChangeDetectionStrategy.OnPush,
template: `
<div class="workspace" [class.menu-open]="menuOpen()">
  <aside class="sidebar" aria-label="Navigation principale">
    <a class="brand" routerLink="/" (click)="menuOpen.set(false)"><span class="brand-mark">D<span>·</span>Solar</span><small>ERP · GESTION INTERNE</small></a>
    <p class="nav-label">ESPACE DE TRAVAIL</p>
    <nav><a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{exact:true}" (click)="menuOpen.set(false)">Accueil</a>
    @if (session.can('sales.read','users.manage')) { <a routerLink="/tableau-de-bord" routerLinkActive="active" (click)="menuOpen.set(false)">Tableau de bord</a> }</nav>
    <div class="sidebar-footer">D-Solar and Agri<br><small>Application interne</small></div>
  </aside>
  <div class="workspace-main"><header class="topbar">
    <button class="menu-toggle secondary" type="button" (click)="menuOpen.set(!menuOpen())" [attr.aria-expanded]="menuOpen()">Menu</button>
    <span class="topbar-title">Espace de gestion</span><div class="user-actions"><span>{{ session.user()?.nomComplet }}</span><button type="button" class="secondary" [disabled]="loggingOut()" (click)="logout()">Déconnexion</button></div>
  </header><main class="page"><router-outlet /></main></div>
</div>` })
export class Shell {
  readonly session = inject(SessionService);
  readonly menuOpen = signal(false);
  readonly loggingOut = signal(false);
  logout(): void {
    if (this.loggingOut()) return;
    this.loggingOut.set(true);
    this.session.logout().subscribe({ error: () => { this.loggingOut.set(false); }, complete: () => this.loggingOut.set(false) });
  }
}
