import { Directive, ElementRef, inject, input, output } from '@angular/core';

@Directive({
  selector: '[appDismissOutside]',
  host: {
    '(document:click)': 'onClick($event)',
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class DismissOutsideDirective {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly appDismissOutside = input(false);
  readonly dismissExceptions = input('');
  readonly dismissed = output<'outside' | 'escape'>();

  onClick(event: MouseEvent): void {
    if (!this.appDismissOutside()) return;
    const path = event.composedPath();
    if (path.includes(this.element.nativeElement)) return;
    const exception = this.dismissExceptions();
    if (exception && path.some((entry) => entry instanceof Element && entry.matches(exception))) return;
    this.dismissed.emit('outside');
  }

  onEscape(): void {
    if (this.appDismissOutside()) this.dismissed.emit('escape');
  }
}
