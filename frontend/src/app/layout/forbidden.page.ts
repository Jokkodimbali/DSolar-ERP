import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
@Component({selector:'app-forbidden-page', imports:[RouterLink], changeDetection:ChangeDetectionStrategy.OnPush, template:'<section class="panel"><h1>Accès non autorisé</h1><p>Votre compte ne dispose pas des autorisations nécessaires.</p><a class="primary" routerLink="/">Retour à l’accueil</a></section>'})
export class ForbiddenPage {}
