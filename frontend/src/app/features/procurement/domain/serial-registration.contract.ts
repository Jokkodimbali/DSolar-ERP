import { isRecord } from '../../../core/api/api-contract';
import { storeId } from '../../stores/domain/store.contract';

export function serialRegistration(value: string): string[] {
  const serials = value.split(/\r?\n/).map((serial) => serial.trim()).filter(Boolean);
  if (
    !serials.length ||
    serials.length > 100 ||
    serials.some((serial) => serial.length > 150) ||
    new Set(serials).size !== serials.length
  )
    throw new Error('Saisissez de 1 à 100 numéros distincts, de 150 caractères maximum chacun.');
  return serials;
}

export function parseSerialRegistration(value: unknown, receiptLineId: string, expected: string[]) {
  if (!isRecord(value) || value['count'] !== expected.length || !Array.isArray(value['serials']))
    throw new Error('Réponse d’enregistrement invalide.');
  const items = value['serials'].map((raw: unknown) => {
    if (
      !isRecord(raw) ||
      raw['receiptLineId'] !== receiptLineId ||
      typeof raw['serial'] !== 'string' ||
      !expected.includes(raw['serial'])
    )
      throw new Error('Numéro de série incohérent.');
    return { id: storeId(raw['id']), serial: raw['serial'] };
  });
  if (
    items.length !== expected.length ||
    new Set(items.map((item) => item.id)).size !== items.length ||
    new Set(items.map((item) => item.serial)).size !== items.length
  )
    throw new Error('Numéros de série incomplets ou en double.');
  return items;
}
