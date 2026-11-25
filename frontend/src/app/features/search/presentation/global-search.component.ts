import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal, viewChild, type ElementRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state.component';
import { UiIconComponent } from '../../../shared/ui/ui-icon.component';
import { SessionService } from '../../auth/application/session.service';
import type { SearchGroup } from '../domain/search.contract';
import { SearchApi } from '../infrastructure/search.api';

@Component({
  selector: 'app-global-search',
  imports: [ReactiveFormsModule, FeedbackComponent, EmptyStateComponent, UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './global-search.component.html',
  host: { '(document:keydown)': 'shortcut($event)' },
})
export class GlobalSearchComponent {
  private readonly api = inject(SearchApi);
  private readonly destroy = inject(DestroyRef);
  private readonly session = inject(SessionService);
  readonly query = new FormControl('', { nonNullable: true, validators: [Validators.maxLength(120)] });
  readonly open = signal(false);
  readonly busy = signal(false);
  readonly submitted = signal('');
  readonly groups = signal<SearchGroup[]>([]);

  private readonly searchField = viewChild<ElementRef<HTMLInputElement>>('searchField');

  shortcut(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.searchField()?.nativeElement.focus();
    }
    if (event.key === 'Escape') this.open.set(false);
  }

  search(): void {
    const query = this.query.value.trim();
    if (this.busy() || !this.session.authenticated() || this.query.invalid || query.length < 2) return;
    const epoch = this.session.sessionVersion();
    this.submitted.set(query);
    this.groups.set([]);
    this.open.set(true);
    this.busy.set(true);
    this.query.disable();
    this.api
      .search(query)
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => {
          this.query.enable();
          this.busy.set(false);
        }),
      )
      .subscribe((groups) => {
        if (epoch === this.session.sessionVersion() && this.session.authenticated()) this.groups.set(groups);
      });
  }
}
