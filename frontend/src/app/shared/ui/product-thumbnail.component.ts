import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { catchError, map, of, switchMap } from 'rxjs';
import { apiPath, isRecord } from '../../core/api/api-contract';
import { UiIconComponent } from './ui-icon.component';

@Component({
  selector: 'app-product-thumbnail',
  imports: [UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="stock-product-icon">
      @if (url(); as photo) {
        <img [src]="photo" alt="" (error)="url.set(null)" />
      } @else {
        <app-ui-icon name="box" />
      }
    </span>
  `,
})
export class ProductThumbnailComponent {
  private readonly http = inject(HttpClient);
  readonly productId = input.required<string>();
  readonly url = signal<string | null>(null);

  constructor() {
    effect((cleanup) => {
      const id = this.productId();
      this.url.set(null);
      let objectUrl: string | null = null;
      const subscription = this.http
        .get<unknown>(apiPath('/media/products/' + id + '/photo'))
        .pipe(
          switchMap((metadata) => {
            if (
              !isRecord(metadata) ||
              typeof metadata['id'] !== 'string' ||
              !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(metadata['id'])
            )
              return of(null);
            return this.http.get(apiPath('/media/images/' + metadata['id']), { responseType: 'blob' });
          }),
          map((blob) =>
            blob && ['image/png', 'image/jpeg'].includes(blob.type) && blob.size <= 5_000_000 ? blob : null,
          ),
          catchError(() => of(null)),
        )
        .subscribe((blob) => {
          if (!blob) return;
          objectUrl = URL.createObjectURL(blob);
          this.url.set(objectUrl);
        });
      cleanup(() => {
        subscription.unsubscribe();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      });
    });
  }
}
