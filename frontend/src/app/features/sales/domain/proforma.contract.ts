import { isRecord } from '../../../core/api/api-contract';
import { storeId } from '../../stores/domain/store.contract';
import { formatMoney } from '../../dashboard/domain/dashboard.contract';

export interface SaleOption {
  readonly id: string;
  readonly name: string;
  readonly sku?: string;
}
export interface LineDraft {
  readonly productId: string;
  readonly storeId: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly discount: string;
  readonly taxRate: string;
}
export interface ProformaInput {
  readonly customerId: string;
  readonly number?: string;
  readonly expiresAt?: string;
  readonly lines: readonly {
    productId: string;
    storeId: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    taxRate: number;
  }[];
}
export interface CreatedProforma {
  readonly id: string;
  readonly number: string;
  readonly total: string;
}

export function parseOptions(value: unknown): SaleOption[] {
  if (!Array.isArray(value)) throw new Error('Liste de références invalide.');
  return value.map((item: unknown) => {
    if (!isRecord(item) || typeof item['name'] !== 'string' || !item['name'].trim())
      throw new Error('Référence commerciale invalide.');
    return {
      id: storeId(item['id']),
      name: item['name'],
      ...(typeof item['sku'] === 'string' ? { sku: item['sku'] } : {}),
    };
  });
}

function decimal(value: string, decimals: number, positive = false): number {
  const normalized = value.trim().replace(',', '.');
  if (!new RegExp('^\\d{1,12}(?:\\.\\d{1,' + decimals + '})?$').test(normalized))
    throw new Error('Vérifiez la précision des quantités, prix, remises et taux.');
  const amount = Number(normalized);
  const scale = 10 ** decimals;
  if (
    !Number.isFinite(amount) ||
    (positive && amount <= 0) ||
    !Number.isSafeInteger(Math.round(amount * scale)) ||
    Number(amount.toFixed(decimals)) !== amount ||
    !new RegExp('^\\d+(?:\\.\\d{1,' + decimals + '})?$').test(String(amount))
  )
    throw new Error('Valeur numérique hors limites.');
  const scaled = (raw: string): bigint => {
    const [whole = '0', fraction = ''] = raw.split('.');
    return BigInt(whole) * BigInt(scale) + BigInt(fraction.padEnd(decimals, '0'));
  };
  if (scaled(normalized) !== scaled(String(amount))) throw new Error('Précision numérique perdue.');
  return amount;
}

export function proformaInput(customerId: string, lines: readonly LineDraft[]): ProformaInput {
  if (!lines.length || lines.length > 100) throw new Error('Une à cent lignes sont requises.');
  const keys = new Set<string>();
  return {
    customerId: storeId(customerId),
    lines: lines.map((line) => {
      const productId = storeId(line.productId);
      const location = storeId(line.storeId);
      const key = location + ':' + productId;
      if (keys.has(key)) throw new Error('Un produit est présent deux fois dans le même magasin.');
      keys.add(key);
      const taxRate = decimal(line.taxRate, 4);
      if (taxRate > 100) throw new Error('Le taux de taxe ne peut pas dépasser 100 %.');
      return {
        productId,
        storeId: location,
        quantity: decimal(line.quantity, 3, true),
        unitPrice: decimal(line.unitPrice, 2),
        discount: decimal(line.discount, 2),
        taxRate,
      };
    }),
  };
}

export function parseCreatedProforma(value: unknown): CreatedProforma {
  if (
    !isRecord(value) ||
    value['status'] !== 'DRAFT' ||
    typeof value['number'] !== 'string' ||
    !value['number'].trim() ||
    typeof value['total'] !== 'string'
  )
    throw new Error('Confirmation de proforma invalide. Vérifiez les devis avant de réessayer.');
  return { id: storeId(value['id']), number: value['number'], total: formatMoney(value['total']) };
}
