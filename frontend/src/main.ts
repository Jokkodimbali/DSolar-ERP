import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
void bootstrapApplication(App, appConfig).catch(() => {
  document.body.textContent = 'Impossible de démarrer DSolar-ERP. Veuillez actualiser la page.';
});
