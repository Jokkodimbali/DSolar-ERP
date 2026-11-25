import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionService } from '../features/auth/application/session.service';
@Component({ selector:'app-home-page', imports:[RouterLink], changeDetection:ChangeDetectionStrategy.OnPush,
template:`<p class="eyebrow">ESPACE DE TRAVAIL</p><h1>Bienvenue, {{ session.user()?.nomComplet }}</h1><p class="muted">Votre session est authentifiée auprès de DSolar-ERP.</p><section class="panel"><h2>Votre espace</h2><p>{{ session.user()?.magasinsAutorises?.length ?? 0 }} magasin(s) affecté(s) à votre compte.</p>@if(session.can('sales.read','users.manage')) { <a class="primary" routerLink="/tableau-de-bord">Ouvrir le tableau de bord</a> } @else { <p>Les interfaces de gestion des magasins seront ajoutées progressivement selon vos autorisations.</p> }</section>` })
export class HomePage { readonly session = inject(SessionService); }
