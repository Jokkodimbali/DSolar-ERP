import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, map, of, switchMap, throwError } from 'rxjs';
import { apiPath } from '../../../core/api/api-contract';
import { storeId } from '../../stores/domain/store.contract';
import { parseInvoice, parseInvoicePage, verifyInvoiceOrder, type InvoiceStatus, type InvoiceAction } from '../domain/invoice.contract';
import type { OrderDetail } from '../domain/order-view.contract';

@Injectable({ providedIn: 'root' })
export class InvoicesApi {
  private readonly http = inject(HttpClient);

  search(page: number, search: string, status: InvoiceStatus | '', orderId?: string) {
    return this.http.get<unknown>(apiPath('/invoices/search'), {
      params: { page, limit: 10, search, ...(status ? { status } : {}), ...(orderId ? { orderId: storeId(orderId) } : {}) },
    }).pipe(map(parseInvoicePage));
  }
  get(id: string) {
    return this.http.get<unknown>(apiPath('/invoices/' + storeId(id))).pipe(map((value) => {
      const invoice = parseInvoice(value);
      if (invoice.id !== id) throw new Error('Identifiant de facture incohérent.');
      return invoice;
    }));
  }
  linked(order: OrderDetail) {
    return this.search(1, '', '', order.id).pipe(map((page) => {
      if (page.total > 1 || page.items.length !== page.total) throw new Error('Plusieurs factures associées à la commande.');
      const invoice = page.items[0];
      return invoice ? verifyInvoiceOrder(invoice, order) : null;
    }));
  }
  create(order: OrderDetail) {
    return this.linked(order).pipe(switchMap((existing) => {
      if (existing) return of(existing);
      return this.http.post<unknown>(apiPath('/invoices/from-order/' + storeId(order.id)), {}).pipe(
        map((value) => verifyInvoiceOrder(parseInvoice(value), order)),
        catchError((error: unknown) => {
          if (!(error instanceof HttpErrorResponse) || ![0, 409].includes(error.status)) return throwError(() => error);
          return this.linked(order).pipe(map((invoice) => {
            if (!invoice) throw error;
            return invoice;
          }));
        }),
      );
    }));
  }
  action(id: string, action: InvoiceAction) {
    return this.http.post<unknown>(apiPath('/invoices/' + storeId(id) + '/' + action), {}).pipe(
      switchMap(() => this.get(id)),
      map((invoice) => {
        if (invoice.status !== (action === 'issue' ? 'ISSUED' : 'CANCELLED')) throw new Error('Statut de facture non confirmé.');
        return invoice;
      }),
    );
  }
}
