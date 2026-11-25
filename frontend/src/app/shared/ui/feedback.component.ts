import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-feedback',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (message()) {
      <p
        class="ui-feedback"
        [class.ui-error]="kind() === 'error'"
        [class.ui-success]="kind() === 'success'"
        [attr.role]="kind() === 'error' ? 'alert' : 'status'"
      >
        {{ message() }}
      </p>
    }
  `,
})
export class FeedbackComponent {
  readonly message = input.required<string>();
  readonly kind = input<'error' | 'success' | 'info'>('info');
}
