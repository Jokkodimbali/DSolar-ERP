import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize, type Observable } from 'rxjs';
import { errorMessage } from '../../../core/api/http-error';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import { PaginationComponent } from '../../../shared/ui/pagination.component';
import { ConfirmComponent } from '../../../shared/ui/confirm.component';
import { SessionService } from '../../auth/application/session.service';
import { StoresApi } from '../../stores/infrastructure/stores.api';
import type { Store } from '../../stores/domain/store.contract';
import { InventoryApi } from '../infrastructure/inventory.api';
import { StockWorkflowsApi } from '../infrastructure/stock-workflows.api';
import { isZero, quantityInput, type StockItem } from '../domain/stock.contract';
import { labels, type Transfer, type CountSession, type TransferInput, type ReceiptInput, type CountInput, type parseTransfer, type parseCount } from '../domain/workflow.contract';

@Component({
  selector: 'app-stock-workflows-page',
  imports: [RouterLink, PageHeaderComponent, FeedbackComponent, PaginationComponent, ConfirmComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './stock-workflows.page.html',
})
export class StockWorkflowsPage {
  private readonly api = inject(StockWorkflowsApi);
  private readonly storesApi = inject(StoresApi);
  private readonly inventory = inject(InventoryApi);
  private readonly destroy = inject(DestroyRef);
  readonly session = inject(SessionService);
  readonly mode = inject(ActivatedRoute).snapshot.data['mode'] === 'counts' ? 'counts' : 'transfers';
  readonly stores = signal<Store[]>([]);
  readonly store = signal('');
  readonly busy = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly search = signal('');
  readonly page = signal(1);
  readonly pages = signal(1);
  readonly total = signal(0);
  readonly transfers = signal<ReturnType<typeof parseTransfer>[]>([]);
  readonly counts = signal<ReturnType<typeof parseCount>[]>([]);
  readonly transfer = signal<Transfer | null>(null);
  readonly count = signal<CountSession | null>(null);
  readonly editing = signal(false);
  readonly stock = signal<StockItem[]>([]);
  readonly destination = signal('');
  readonly lines = signal<{ productId: string; quantity: string }[]>([]);
  readonly number = signal('');
  readonly draft = signal<TransferInput | null>(null);
  readonly receipt = signal<ReceiptInput | null>(null);
  readonly receiptFields = signal<Record<string, { received: string; damaged: string; missing: string }>>({});
  readonly counted = signal<Record<string, { counted: string; reason: string }>>({});
  readonly confirmation = signal<'approve' | 'ship' | 'cancel' | 'validate' | 'start' | null>(null);
  readonly labels = labels;
  readonly date = (value: string) => new Intl.DateTimeFormat('fr-SN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Africa/Dakar' }).format(new Date(value));
  readonly manageable = computed(() => this.session.can('inventory.manage'));
  readonly title = this.mode === 'counts' ? 'Inventaires physiques' : 'Transferts de stock';
  readonly canOrigin = computed(() => this.stores().some((store) => store.id === this.transfer()?.originId));
  readonly canDestination = computed(() => this.stores().some((store) => store.id === this.transfer()?.destinationId));

  constructor() {
    this.loading.set(true);
    this.storesApi.list().pipe(takeUntilDestroyed(this.destroy), finalize(() => this.loading.set(false))).subscribe({
      next: (stores) => { this.stores.set(stores.filter((store) => store.status === 'ACTIVE')); this.store.set(this.stores()[0]?.id ?? ''); this.loading.set(false); this.load(1); },
      error: (error: unknown) => this.error.set(errorMessage(error)),
    });
  }

  changeStore(id: string): void {
    if (this.busy() || this.loading() || !this.stores().some((store) => store.id === id)) return;
    this.close(); this.store.set(id); this.load(1);
  }
  filter(search: string): void { this.search.set(search.trim()); this.load(1); }
  load(page = this.page()): void {
    if (this.loading() || this.busy() || !this.store()) return;
    this.loading.set(true); this.error.set('');
    const done = (value: { page: number; pages: number; total: number }) => { this.page.set(value.page); this.pages.set(value.pages || 1); this.total.set(value.total); };
    if (this.mode === 'transfers') {
      this.api.transfers(this.store(), page, this.search()).pipe(takeUntilDestroyed(this.destroy), finalize(() => this.loading.set(false))).subscribe({
        next: (value) => { this.transfers.set(value.items); done(value); }, error: (error: unknown) => { this.transfers.set([]); this.error.set(errorMessage(error)); },
      });
    } else {
      this.api.counts(this.store(), page, this.search()).pipe(takeUntilDestroyed(this.destroy), finalize(() => this.loading.set(false))).subscribe({
        next: (value) => { this.counts.set(value.items); done(value); }, error: (error: unknown) => { this.counts.set([]); this.error.set(errorMessage(error)); },
      });
    }
  }
  close(): void {
    if (this.busy()) return;
    this.transfer.set(null); this.count.set(null); this.editing.set(false); this.confirmation.set(null); this.draft.set(null); this.receipt.set(null);
    this.receiptFields.set({}); this.counted.set({});
  }
  open(id: string, message = '', reload = false): void {
    if (this.busy()) return;
    this.close();
    if (this.mode === 'transfers') this.run(this.api.transferDetail(id), message, (value) => { this.transfer.set(value); if (reload) this.load(1); });
    else this.run(this.api.countDetail(id), message, (value) => { this.count.set(value); this.counted.set(Object.fromEntries(value.lines.map((line) => [line.productId, { counted: line.counted ?? '', reason: line.reason }]))); if (reload) this.load(1); });
  }
  create(): void {
    if (this.busy() || this.loading() || !this.manageable() || !this.store()) return;
    this.close();
    if (this.mode === 'counts') { this.confirmation.set('start'); return; }
    this.number.set('TR-' + crypto.randomUUID().toUpperCase()); this.destination.set('');
    this.lines.set([{ productId: '', quantity: '' }]);
    this.run(this.inventory.stock(this.store()), '', (value) => { this.stock.set(value); this.editing.set(true); });
  }
  addLine(): void { if (!this.draft() && this.lines().length < 100) this.lines.update((lines) => [...lines, { productId: '', quantity: '' }]); }
  removeLine(index: number): void { if (!this.draft() && this.lines().length > 1) this.lines.update((lines) => lines.filter((_, i) => i !== index)); }
  changeLine(index: number, key: 'productId' | 'quantity', value: string): void {
    if (!this.draft()) this.lines.update((lines) => lines.map((line, i) => i === index ? { ...line, [key]: value } : line));
  }
  saveTransfer(): void {
    if (this.busy() || !this.manageable()) return;
    try {
      if (!this.draft()) {
        if (!this.destination() || this.destination() === this.store() || !this.stores().some((store) => store.id === this.destination())) throw new Error('Choisissez un magasin destinataire différent.');
        const lines = this.lines().map((line) => {
          if (!this.stock().some((product) => product.productId === line.productId)) throw new Error('Sélectionnez un produit pour chaque ligne.');
          return { productId: line.productId, quantity: quantityInput(line.quantity, true) };
        });
        if (new Set(lines.map((line) => line.productId)).size !== lines.length) throw new Error('Un produit ne peut apparaître plusieurs fois.');
        this.draft.set({ number: this.number(), originId: this.store(), destinationId: this.destination(), lines });
      }
      const input = this.draft();
      if (input) this.run(this.api.createTransfer(input), 'Transfert créé.', (id) => { this.open(id, 'Transfert créé.', true); });
    } catch (error: unknown) { this.validationError(error); }
  }
  updateReceipt(id: string, key: 'received' | 'damaged' | 'missing', value: string): void {
    if (this.receipt()) return;
    this.receiptFields.update((fields) => ({ ...fields, [id]: { ...(fields[id] ?? { received: '0', damaged: '0', missing: '0' }), [key]: value } }));
  }
  receive(finalizeReceipt: boolean): void {
    const target = this.transfer();
    if (!target || this.busy() || !this.manageable() || !this.canDestination() || target.status !== 'SHIPPED') return;
    try {
      if (!this.receipt()) {
        const lines = target.lines.map((line) => {
          const field = this.receiptFields()[line.id] ?? { received: '0', damaged: '0', missing: '0' };
          return { lineId: line.id, received: quantityInput(field.received || '0'), damaged: quantityInput(field.damaged || '0'), missing: quantityInput(field.missing || '0') };
        }).filter((line) => ![line.received, line.damaged, line.missing].every(isZero));
        if (!lines.length) throw new Error('Saisissez au moins une quantité non nulle.');
        this.receipt.set({ operationKey: crypto.randomUUID(), finalize: finalizeReceipt, lines });
      }
      const input = this.receipt();
      if (input) this.run(this.api.receive(target.id, input), 'Réception enregistrée.', () => { this.open(target.id, 'Réception enregistrée.', true); });
    } catch (error: unknown) { this.validationError(error); }
  }
  updateCount(id: string, key: 'counted' | 'reason', value: string): void {
    this.counted.update((fields) => ({ ...fields, [id]: { ...(fields[id] ?? { counted: '', reason: '' }), [key]: value } }));
  }
  recordLine(id: string): void {
    const target = this.count();
    if (!target || this.busy() || !this.manageable() || target.status !== 'DRAFT') return;
    try {
      const value = this.counted()[id];
      if (!value) throw new Error('Saisissez la quantité comptée.');
      const line: CountInput = { productId: id, counted: quantityInput(value.counted), ...(value.reason.trim() ? { reason: value.reason.trim() } : {}) };
      this.run(this.api.record(target.id, [line]), 'Comptage enregistré.', () => {
        this.run(this.api.countDetail(target.id), 'Comptage enregistré.', (updated) => this.count.set(updated));
      });
    } catch (error: unknown) { this.validationError(error); }
  }
  confirm(): void {
    const action = this.confirmation();
    if (!action || this.busy() || !this.manageable()) return;
    if (action === 'start') { this.run(this.api.startCount(this.store()), 'Inventaire ouvert.', (id) => { this.open(id); this.load(1); }); return; }
    const transfer = this.transfer(), count = this.count();
    if (transfer && this.canOrigin() && action !== 'validate') {
      this.run(this.api.transferAction(transfer.id, action), 'Transfert mis à jour.', () => { this.open(transfer.id, 'Transfert mis à jour.', true); });
    } else if (count && (action === 'validate' || action === 'cancel')) {
      this.run(this.api.countAction(count.id, action), 'Inventaire mis à jour.', () => { this.open(count.id, 'Inventaire mis à jour.', true); });
    }
  }
  private validationError(error: unknown): void { this.error.set(error instanceof Error ? error.message : 'Données invalides.'); }
  private run<T>(request: Observable<T>, message: string, done: (value: T) => void): void {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.success.set('');
    request.pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: (value) => { this.busy.set(false); this.success.set(message); done(value); },
      error: (error: unknown) => { this.busy.set(false); this.error.set(errorMessage(error)); },
    });
  }
}
