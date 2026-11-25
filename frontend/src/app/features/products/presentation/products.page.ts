import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, forkJoin, type Observable } from 'rxjs';
import { errorMessage } from '../../../core/api/http-error';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { FeedbackComponent } from '../../../shared/ui/feedback.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { ConfirmComponent } from '../../../shared/ui/confirm.component';
import { PaginationComponent } from '../../../shared/ui/pagination.component';
import { ProductThumbnailComponent } from '../../../shared/ui/product-thumbnail.component';
import { SessionService } from '../../auth/application/session.service';
import {
  decimalInput,
  emptyFilters,
  type Product,
  type ProductFilters,
  type ProductInput,
  type Reference,
  type ReferenceKind,
  type ProductPrice,
  type parseProductPage,
} from '../domain/product.contract';
import { ProductsApi } from '../infrastructure/products.api';
import { formatMoney } from '../../dashboard/domain/dashboard.contract';

@Component({
  selector: 'app-products-page',
  imports: [
    ReactiveFormsModule,
    PageHeaderComponent,
    FeedbackComponent,
    EmptyStateComponent,
    StatusBadgeComponent,
    ConfirmComponent,
    PaginationComponent,
    ProductThumbnailComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './products.page.html',
})
export class ProductsPage {
  private readonly api = inject(ProductsApi);
  private readonly destroy = inject(DestroyRef);
  readonly session = inject(SessionService);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly result = signal<ReturnType<typeof parseProductPage> | null>(null);
  readonly filters = signal<ProductFilters>(emptyFilters);
  readonly categories = signal<Reference[]>([]);
  readonly brands = signal<Reference[]>([]);
  readonly taxes = signal<Reference[]>([]);
  readonly editing = signal<Product | 'new' | null>(null);
  readonly pending = signal<Product | null>(null);
  readonly selected = signal<Product | null>(null);
  readonly prices = signal<ProductPrice[]>([]);
  readonly referenceKind = signal<ReferenceKind | null>(null);
  readonly referenceList = signal<ReferenceKind | null>(null);
  readonly renameTarget = signal<{ kind: ReferenceKind; reference: Reference } | null>(null);
  readonly deleteTarget = signal<{ kind: 'categories' | 'brands'; reference: Reference } | null>(null);
  readonly renameName = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(200)],
  });
  readonly photoVersion = signal(0);
  readonly money = formatMoney;
  readonly form = new FormGroup({
    sku: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/)],
    }),
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    description: new FormControl('', { nonNullable: true }),
    unit: new FormControl('PIECE', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(40)],
    }),
    categoryId: new FormControl('', { nonNullable: true }),
    brandId: new FormControl('', { nonNullable: true }),
    taxRegimeId: new FormControl('', { nonNullable: true }),
    isSolarPlant: new FormControl(false, { nonNullable: true }),
  });
  readonly referenceForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    code: new FormControl('', { nonNullable: true }),
    parentId: new FormControl('', { nonNullable: true }),
    rate: new FormControl('', { nonNullable: true }),
    legalBasis: new FormControl('', { nonNullable: true }),
  });
  readonly priceForm = new FormGroup({
    salePrice: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    purchasePrice: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    this.loadReferences();
    this.load(1);
  }

  loadReferences(): void {
    forkJoin({
      categories: this.api.references('categories'),
      brands: this.api.references('brands'),
      taxes: this.api.references('tax-regimes'),
    })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (value) => {
          this.categories.set(value.categories);
          this.brands.set(value.brands);
          this.taxes.set(value.taxes);
        },
        error: (error: unknown) => this.error.set(errorMessage(error)),
      });
  }

  applyFilters(filters: ProductFilters): void {
    if (this.loading() || this.busy()) return;
    this.filters.set({ ...filters, search: filters.search.trim() });
    this.load(1);
  }

  load(page = this.result()?.page ?? 1): void {
    if (this.loading() || this.busy() || page < 1) return;
    this.loading.set(true);
    this.error.set('');
    this.api
      .search(page, this.filters())
      .pipe(
        takeUntilDestroyed(this.destroy),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (value) => this.result.set(value),
        error: (error: unknown) => {
          this.result.set(null);
          this.error.set(errorMessage(error));
        },
      });
  }

  nameOf(references: readonly Reference[], id: string | null): string {
    return references.find((ref) => ref.id === id)?.name ?? '—';
  }

  close(): void {
    if (this.busy()) return;
    this.editing.set(null);
    this.pending.set(null);
    this.selected.set(null);
    this.referenceKind.set(null);
    this.renameTarget.set(null);
    this.deleteTarget.set(null);
    this.prices.set([]);
  }

  edit(product: Product | 'new'): void {
    if (this.busy() || !this.session.can('products.manage')) return;
    this.close();
    this.editing.set(product);
    this.form.reset(
      product === 'new'
        ? {
            sku: '',
            name: '',
            description: '',
            unit: 'PIECE',
            categoryId: '',
            brandId: '',
            taxRegimeId: '',
            isSolarPlant: false,
          }
        : {
            sku: product.sku,
            name: product.name,
            description: product.description ?? '',
            unit: product.unit,
            categoryId: product.categoryId ?? '',
            brandId: product.brandId ?? '',
            taxRegimeId: product.taxRegimeId ?? '',
            isSolarPlant: product.isSolarPlant,
          },
    );
    if (product === 'new') this.form.controls.sku.enable();
    else this.form.controls.sku.disable();
  }

  save(): void {
    const target = this.editing();
    if (!target || this.busy() || !this.session.can('products.manage')) return;
    this.form.markAllAsTouched();
    const value = this.form.getRawValue();
    if (this.form.invalid || !value.name.trim() || !value.unit.trim()) {
      this.error.set('Renseignez un SKU valide, le nom et l’unité.');
      return;
    }
    const input: ProductInput = {
      name: value.name.trim(),
      description: value.description.trim() || null,
      unit: value.unit.trim(),
      categoryId: value.categoryId || null,
      brandId: value.brandId || null,
      taxRegimeId: value.taxRegimeId || null,
      isSolarPlant: value.isSolarPlant,
    };
    this.mutate(
      target === 'new' ? this.api.create(value.sku, input) : this.api.update(target.id, input),
      'Produit enregistré.',
      () => {
        this.close();
        this.load(1);
      },
    );
  }

  askStatus(product: Product): void {
    if (this.busy() || !this.session.can('products.manage')) return;
    this.close();
    this.pending.set(product);
  }

  changeStatus(): void {
    const product = this.pending();
    if (!product || !this.session.can('products.manage')) return;
    this.mutate(this.api.status(product.id, !product.active), 'Statut du produit mis à jour.', () => {
      this.close();
      this.load();
    });
  }

  detail(product: Product): void {
    if (this.busy()) return;
    this.close();
    this.priceForm.reset();
    this.mutate(
      forkJoin({ product: this.api.get(product.id), prices: this.api.prices(product.id) }),
      '',
      (value) => {
        this.selected.set(value.product);
        this.prices.set(value.prices);
      },
    );
  }

  savePrice(): void {
    const product = this.selected();
    if (!product || this.busy() || !this.session.can('products.manage')) return;
    try {
      const { salePrice, purchasePrice } = this.priceForm.getRawValue();
      const sale = decimalInput(salePrice);
      const purchase = purchasePrice.trim() ? decimalInput(purchasePrice) : undefined;
      this.mutate(this.api.setPrice(product.id, sale, purchase), 'Nouveau tarif enregistré.', () => {
        this.priceForm.reset();
        this.detail(product);
      });
    } catch (error: unknown) {
      this.error.set(errorMessage(error));
    }
  }

  upload(file: File | undefined): void {
    const product = this.selected();
    if (!product || !file || this.busy() || !this.session.can('products.manage')) return;
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 2 * 1024 * 1024 || file.size === 0) {
      this.error.set('Sélectionnez une image JPEG ou PNG de 2 Mo maximum.');
      return;
    }
    this.mutate(this.api.upload(product.id, file), 'Photo enregistrée.', () =>
      this.photoVersion.update((value) => value + 1),
    );
  }

  referencesFor(kind: ReferenceKind): Reference[] {
    return kind === 'categories' ? this.categories() : kind === 'brands' ? this.brands() : this.taxes();
  }

  rename(kind: ReferenceKind, reference: Reference): void {
    if (this.busy() || !this.session.can('products.manage')) return;
    this.close();
    this.renameName.reset(reference.name);
    this.renameTarget.set({ kind, reference });
  }

  saveRename(): void {
    const target = this.renameTarget();
    if (!target || this.busy() || !this.session.can('products.manage')) return;
    const name = this.renameName.value.trim();
    if (!name || this.renameName.invalid) {
      this.error.set('Renseignez un libellé valide.');
      return;
    }
    this.mutate(this.api.renameReference(target.kind, target.reference.id, name), 'Référence mise à jour.', () => {
      this.close();
      this.loadReferences();
    });
  }

  askDelete(kind: ReferenceKind, reference: Reference): void {
    if (kind === 'tax-regimes' || this.busy() || !this.session.can('products.manage')) return;
    this.close();
    this.deleteTarget.set({ kind, reference });
  }

  deleteReference(): void {
    const target = this.deleteTarget();
    if (!target || this.busy() || !this.session.can('products.manage')) return;
    this.mutate(this.api.deleteReference(target.kind, target.reference.id), 'Référence supprimée.', () => {
      this.close();
      this.loadReferences();
      const key = target.kind === 'categories' ? 'categoryId' : 'brandId';
      if (this.filters()[key] === target.reference.id) this.filters.update((value) => ({ ...value, [key]: '' }));
      this.load(1);
    });
  }

  openReference(kind: ReferenceKind): void {
    if (this.busy() || !this.session.can('products.manage')) return;
    this.close();
    this.referenceForm.reset();
    this.referenceKind.set(kind);
  }

  saveReference(): void {
    const kind = this.referenceKind();
    const value = this.referenceForm.getRawValue();
    if (!kind || this.busy() || !this.session.can('products.manage')) return;
    if (
      this.referenceForm.invalid ||
      !value.name.trim() ||
      (kind !== 'brands' && !/^[A-Za-z0-9][A-Za-z0-9_-]{1,59}$/.test(value.code.trim()))
    ) {
      this.error.set('Renseignez un nom et, si nécessaire, un code valide.');
      return;
    }
    try {
      const input = {
        name: value.name.trim(),
        ...(kind !== 'brands' ? { code: value.code.trim() } : {}),
        ...(kind === 'categories' && value.parentId ? { parentId: value.parentId } : {}),
        ...(kind === 'tax-regimes'
          ? { rate: decimalInput(value.rate, 4), legalBasis: value.legalBasis.trim() }
          : {}),
      };
      this.mutate(this.api.createReference(kind, input), 'Référence créée.', () => {
        this.close();
        this.loadReferences();
      });
    } catch (error: unknown) {
      this.error.set(errorMessage(error));
    }
  }

  private mutate<T>(request: Observable<T>, message: string, done: (value: T) => void): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.success.set('');
    request.pipe(takeUntilDestroyed(this.destroy)).subscribe({
      next: (value) => {
        this.busy.set(false);
        done(value);
        this.success.set(message);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.error.set(errorMessage(error));
      },
    });
  }
}
