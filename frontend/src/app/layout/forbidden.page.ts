import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { PageHeaderComponent } from '../shared/ui/page-header.component';

@Component({
  selector: 'app-forbidden-page',
  imports: [RouterLink, PageHeaderComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header eyebrow="AUTORISATIONS" heading="Accès non autorisé" description="Accès réservé." />
    <section class="panel">
      <app-empty-state
        heading="Vous ne disposez pas des autorisations nécessaires"
        description="Contactez votre administrateur si vous avez besoin de cet accès."
      >
        <a class="primary" routerLink="/">Retour à l’accueil</a>
      </app-empty-state>
    </section>
  `,
})
export class ForbiddenPage {}
