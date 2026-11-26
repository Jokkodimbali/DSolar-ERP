import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionService } from '../features/auth/application/session.service';
import { PageHeaderComponent } from '../shared/ui/page-header.component';
import { UiIconComponent } from '../shared/ui/ui-icon.component';

@Component({
  selector: 'app-home-page',
  imports: [RouterLink, PageHeaderComponent, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      eyebrow="ESPACE DE TRAVAIL"
      [heading]="'Bienvenue, ' + (session.user()?.nomComplet ?? '')"
      description="Retrouvez les modules accessibles à votre compte."
    />
    <div class="ui-shortcut-grid">
      @if (session.can('sales.read', 'users.manage')) {
        <a class="panel ui-shortcut" routerLink="/tableau-de-bord">
          <span class="ui-kpi-icon"><app-ui-icon name="dashboard" /></span>
          <span><strong>Tableau de bord</strong><small>Indicateurs et activité</small></span>
        </a>
      }
      @if (session.can('sales.read')) {
        <a class="panel ui-shortcut" routerLink="/ventes/commandes">
          <span class="ui-kpi-icon" data-tone="blue"><app-ui-icon name="cart" /></span>
          <span><strong>Commandes</strong><small>Consulter les ventes</small></span>
        </a>
      }
      @if (session.can('stores.read', 'inventory.read')) {
        <a class="panel ui-shortcut" routerLink="/stocks">
          <span class="ui-kpi-icon" data-tone="orange"><app-ui-icon name="box" /></span>
          <span><strong>Stocks</strong><small>Quantités et disponibilités</small></span>
        </a>
      }
      @if (session.can('stores.read')) {
        <a class="panel ui-shortcut" routerLink="/magasins">
          <span class="ui-kpi-icon" data-tone="green"><app-ui-icon name="store" /></span>
          <span>
            <strong>Magasins</strong>
            <small>{{ session.user()?.magasinsAutorises?.length ?? 0 }} magasin(s) affecté(s)</small>
          </span>
        </a>
      }
      @if (session.can('users.manage')) {
        <a class="panel ui-shortcut" routerLink="/comptabilite">
          <span class="ui-kpi-icon"><app-ui-icon name="layers" /></span>
          <span><strong>Comptabilité</strong><small>Écritures et états automatiques</small></span>
        </a>
      }
      @if (session.can('users.manage')) {
        <a class="panel ui-shortcut" routerLink="/parametres">
          <span class="ui-kpi-icon"><app-ui-icon name="layers" /></span>
          <span><strong>Paramètres</strong><small>Informations et préférences de l’entreprise</small></span>
        </a>
      }
      <a class="panel ui-shortcut" routerLink="/mon-compte">
        <span class="ui-kpi-icon"><app-ui-icon name="user" /></span>
        <span><strong>Mon compte</strong><small>Identité et autorisations</small></span>
      </a>
    </div>
  `,
})
export class HomePage {
  readonly session = inject(SessionService);
}
