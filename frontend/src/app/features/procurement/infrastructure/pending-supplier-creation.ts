import { isRecord } from '../../../core/api/api-contract';
import { supplierId, type SupplierInput } from '../domain/supplier.contract';

export interface PendingSupplierCreation {
  readonly operationKey: string;
  readonly input: SupplierInput;
}

export function supplierCreationStorageKey(actorId: string): string {
  return 'dsolar.supplier.pending.v1:' + supplierId(actorId);
}

export function parsePendingSupplierCreation(value: unknown): PendingSupplierCreation {
  if (!isRecord(value) || !isRecord(value['input'])) throw new Error('Création en attente invalide.');
  const input = value['input'];
  const name = input['name'];
  if (typeof name !== 'string' || !name.trim() || name.length > 180)
    throw new Error('Nom du fournisseur invalide.');
  const optional = (key: string, max: number): string | null => {
    const field = input[key];
    if (field === null || (typeof field === 'string' && field.length <= max)) return field;
    throw new Error('Coordonnées en attente invalides.');
  };
  return {
    operationKey: supplierId(value['operationKey']),
    input: {
      name,
      taxId: optional('taxId', 100),
      phone: optional('phone', 50),
      email: optional('email', 254),
      address: optional('address', 500),
    },
  };
}
