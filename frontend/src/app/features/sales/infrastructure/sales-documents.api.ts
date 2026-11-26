import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { documentPath, validatePdf, type SalesDocument } from '../domain/sales-document.contract';

@Injectable({ providedIn: 'root' })
export class SalesDocumentsApi {
  private readonly http = inject(HttpClient);

  download(document: SalesDocument) {
    return this.http
      .get(documentPath(document), { responseType: 'blob' })
      .pipe(switchMap((blob) => from(validatePdf(blob))));
  }
}
