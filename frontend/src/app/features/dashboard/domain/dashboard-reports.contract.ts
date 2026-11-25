import { isRecord } from '../../../core/api/api-contract';
import { formatMoney } from './dashboard.contract';

type Kind = 'text' | 'count' | 'money' | 'quantity' | 'month' | 'date';
type Field = readonly [key: string, label: string, kind: Kind];
export interface ReportDefinition {
  readonly title: string;
  readonly path: string;
  readonly metrics?: readonly Field[];
  readonly rows?: { readonly key: string; readonly fields: readonly Field[] };
  readonly currency?: boolean;
  readonly basis?: string;
  readonly exportName?: string;
}

const store: Field = ['storeName', 'Magasin', 'text'];
const quantity: Field = ['quantity', 'Quantité', 'quantity'];

export const reports: readonly ReportDefinition[] = [
  {
    title: 'Créances clients',
    path: 'receivables',
    currency: true,
    basis: 'ACTIVE_SALES_ORDERS_NET_OF_CREDITS',
    exportName: 'receivables.csv',
    metrics: [
      ['orders', 'Commandes', 'count'],
      ['unpaidOrders', 'Impayées', 'count'],
      ['partiallyPaidOrders', 'Partiellement payées', 'count'],
      ['paidOrders', 'Payées', 'count'],
      ['overpaidOrders', 'Avec trop-perçu', 'count'],
      ['total', 'Total brut', 'money'],
      ['credited', 'Avoirs', 'money'],
      ['netTotal', 'Total net', 'money'],
      ['paid', 'Encaissé', 'money'],
      ['outstanding', 'Reste à encaisser', 'money'],
      ['overpaid', 'Trop-perçus', 'money'],
    ],
  },
  {
    title: 'Facturation mensuelle',
    path: 'monthly-revenue',
    currency: true,
    basis: 'ISSUED_INVOICES',
    rows: {
      key: 'months',
      fields: [
        ['month', 'Mois', 'month'],
        ['revenue', 'Factures émises', 'money'],
      ],
    },
  },
  {
    title: 'Produits les plus vendus',
    path: 'top-products',
    rows: {
      key: 'items',
      fields: [['sku', 'Référence', 'text'], ['name', 'Produit', 'text'], quantity],
    },
  },
  {
    title: 'Ventes par magasin',
    path: 'store-sales',
    currency: true,
    basis: 'CONFIRMED_SALES_ORDER_LINES',
    exportName: 'store-sales.csv',
    rows: {
      key: 'stores',
      fields: [store, quantity, ['amount', 'Montant des commandes confirmées', 'money']],
    },
  },
  {
    title: 'Suivi des achats',
    path: 'procurement',
    metrics: [['total', 'Total des commandes', 'count']],
    rows: {
      key: 'statuses',
      fields: [
        ['status', 'Statut', 'text'],
        ['count', 'Nombre', 'count'],
      ],
    },
  },
  {
    title: 'Valorisation du stock au prix d’achat courant',
    path: 'stock-valuation',
    currency: true,
    basis: 'ON_HAND_QUANTITY_TIMES_CURRENT_PURCHASE_PRICE',
    exportName: 'stock-valuation.csv',
    metrics: [
      ['totalValued', 'Valeur totale', 'money'],
      ['unvaluedProducts', 'Produits sans coût', 'count'],
    ],
    rows: {
      key: 'stores',
      fields: [store, ['valued', 'Valeur', 'money'], ['unvaluedProducts', 'Produits sans coût', 'count']],
    },
  },
  {
    title: 'Activité récente',
    path: 'recent-activity',
    rows: {
      key: 'items',
      fields: [
        ['action', 'Action', 'text'],
        ['entityType', 'Type', 'text'],
        ['entityId', 'Référence', 'text'],
        ['createdAt', 'Date', 'date'],
      ],
    },
  },
  {
    title: 'État des stocks par magasin',
    path: 'overview',
    metrics: [['grossInvoiced', 'Facturation brute', 'money']],
    rows: {
      key: 'storesStock',
      fields: [
        store,
        ['products', 'Produits', 'count'],
        ['outOfStock', 'Ruptures', 'count'],
        quantity,
        ['reserved', 'Réservé', 'quantity'],
      ],
    },
  },
];

export interface ReportView {
  readonly metrics: readonly { label: string; value: string }[];
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly chart?: readonly { label: string; amount: string; height: number; negative: boolean }[];
}

function invalid(): never {
  throw new Error('Rapport serveur invalide.');
}

function cell(value: unknown, kind: Kind): string {
  if (kind === 'count') {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return invalid();
    return String(value);
  }
  if (kind === 'month') {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 12) return invalid();
    return new Intl.DateTimeFormat('fr-SN', { month: 'long', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2000, value - 1, 1)),
    );
  }
  if (typeof value !== 'string' || !value.trim()) return invalid();
  if (kind === 'money') return formatMoney(value);
  if (kind === 'quantity') {
    if (!/^-?\d+(?:\.\d+)?$/.test(value)) return invalid();
    return value.replace('.', ',');
  }
  if (kind === 'date') {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return invalid();
    return new Intl.DateTimeFormat('fr-SN', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Africa/Dakar',
    }).format(date);
  }
  return value;
}

export function parseReport(value: unknown, definition: ReportDefinition, year: number): ReportView {
  if (!isRecord(value)) return invalid();
  if (definition.currency && value['currency'] !== 'XOF') return invalid();
  if (definition.basis && value['basis'] !== definition.basis) return invalid();
  const metrics = (definition.metrics ?? []).map(([key, label, kind]) => ({
    label,
    value: cell(value[key], kind),
  }));
  const fields = definition.rows;
  if (!fields) return { metrics, headers: [], rows: [] };
  const items = value[fields.key];
  if (!Array.isArray(items)) return invalid();
  if (definition.path === 'monthly-revenue') {
    if (value['year'] !== year || items.length !== 12) return invalid();
    if (!items.every((item: unknown, index) => isRecord(item) && item['month'] === index + 1))
      return invalid();
  }
  const rows = items.map((item: unknown) => {
    if (!isRecord(item)) return invalid();
    return fields.fields.map(([key, , kind]) => cell(item[key], kind));
  });
  const headers = fields.fields.map(([, label]) => label);
  if (definition.path !== 'monthly-revenue') return { metrics, headers, rows };
  const amounts = items.map((item: unknown) => {
    if (!isRecord(item) || typeof item['revenue'] !== 'string') return invalid();
    return item['revenue'];
  });
  return { metrics, headers, rows, chart: revenueChart(amounts) };
}

export function revenueChart(amounts: readonly string[]) {
  // Calcul uniquement graphique : les montants exacts restent les chaînes du serveur.
  const cents = amounts.map((amount) => {
    if (!/^-?\d+(?:\.\d{1,2})?$/.test(amount)) return invalid();
    const [whole = '0', fraction = ''] = amount.replace('-', '').split('.');
    const magnitude = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    return amount.startsWith('-') ? -magnitude : magnitude;
  });
  const abs = (value: bigint) => (value < 0n ? -value : value);
  const peak = cents.reduce((max, value) => (abs(value) > max ? abs(value) : max), 0n);
  return cents.map((value, index) => ({
    label: new Intl.DateTimeFormat('fr-SN', { month: 'short', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2000, index, 1)),
    ),
    amount: formatMoney(amounts[index] ?? '0'),
    height: peak === 0n ? 0 : Number((abs(value) * 10000n) / peak) / 100,
    negative: value < 0n,
  }));
}
