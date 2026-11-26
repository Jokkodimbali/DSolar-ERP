import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import { companyInput, parseCompany, parseLogo, type CompanySettings } from '../domain/company.contract';

@Injectable({ providedIn: 'root' })
export class CompanySettingsApi {
  private readonly http = inject(HttpClient);
  private readonly path = apiPath('/settings/company');

  current() {
    return this.http.get<unknown>(this.path).pipe(map(parseCompany));
  }

  save(settings: CompanySettings) {
    const input = companyInput(settings.input);
    return this.http.put<unknown>(this.path, { ...input, expectedRevision: settings.revision }).pipe(
      map((value) => {
        const saved = parseCompany(value);
        if (saved.revision !== settings.revision + 1 || JSON.stringify(saved.input) !== JSON.stringify(input))
          throw new Error('Enregistrement non vérifié.');
        return saved;
      }),
    );
  }

  upload(file: File) {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<unknown>(apiPath('/media/company/logo'), body).pipe(map(parseLogo));
  }
}
