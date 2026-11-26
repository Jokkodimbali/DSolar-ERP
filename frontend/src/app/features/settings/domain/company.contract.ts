import { isRecord } from '../../../core/api/api-contract';
import { storeId } from '../../stores/domain/store.contract';

export const companyFields = [
  { key: 'legalName', label: 'Raison sociale', max: 180, group: 'identity' },
  { key: 'tradeName', label: 'Nom commercial', max: 180, group: 'identity' },
  { key: 'legalForm', label: 'Forme juridique', max: 100, group: 'identity' },
  { key: 'taxId', label: 'NINEA / identifiant fiscal', max: 80, group: 'identity' },
  { key: 'registrationNumber', label: 'Registre du commerce', max: 100, group: 'identity' },
  { key: 'address', label: 'Adresse', max: 500, group: 'contact' },
  { key: 'phone', label: 'Téléphone', max: 60, group: 'contact' },
  { key: 'email', label: 'Adresse électronique', max: 254, group: 'contact' },
  { key: 'website', label: 'Site internet (HTTPS)', max: 300, group: 'contact' },
  { key: 'bankName', label: 'Banque', max: 180, group: 'documents' },
  { key: 'bankAccount', label: 'Compte bancaire', max: 180, group: 'documents' },
  { key: 'documentFooter', label: 'Pied de page des documents', max: 500, group: 'documents' },
  { key: 'timeZone', label: 'Fuseau horaire IANA', max: 80, group: 'preferences' },
] as const;
export type CompanyField = (typeof companyFields)[number]['key'];
export type CompanyInput = Record<CompanyField, string> & {
  logoUrl: string;
  notificationsEnabled: boolean;
  lowStockThreshold: number;
};
export interface CompanySettings {
  revision: number;
  input: CompanyInput;
}

function invalid(): never {
  throw new Error('Paramètres de l’entreprise invalides.');
}

export function logoPath(value: unknown): string {
  if (value === '') return '';
  if (typeof value !== 'string' || !value.startsWith('/api/v1/media/images/')) return invalid();
  return '/api/v1/media/images/' + storeId(value.slice('/api/v1/media/images/'.length));
}

export function blankCompany(): CompanyInput {
  return {
    legalName: '',
    tradeName: '',
    legalForm: '',
    taxId: '',
    registrationNumber: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    bankName: '',
    bankAccount: '',
    documentFooter: '',
    timeZone: 'Africa/Dakar',
    logoUrl: '',
    notificationsEnabled: true,
    lowStockThreshold: 0,
  };
}

export function companyInput(value: unknown, requireName = true): CompanyInput {
  if (!isRecord(value)) return invalid();
  const result = blankCompany();
  for (const field of companyFields) {
    const raw = value[field.key];
    if (typeof raw !== 'string' || raw.length > field.max) return invalid();
    result[field.key] = raw.trim();
  }
  if (requireName && !result.legalName) throw new Error('La raison sociale est obligatoire.');
  if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email))
    throw new Error('L’adresse électronique est invalide.');
  if (result.website) {
    try {
      const url = new URL(result.website);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
    } catch {
      throw new Error('Le site internet doit utiliser HTTPS sans identifiants.');
    }
  }
  if (!result.timeZone) result.timeZone = 'Africa/Dakar';
  try {
    new Intl.DateTimeFormat('fr-SN', { timeZone: result.timeZone });
  } catch {
    throw new Error('Le fuseau horaire est invalide.');
  }
  result.logoUrl = logoPath(value['logoUrl']);
  const threshold = value['lowStockThreshold'];
  const notifications = value['notificationsEnabled'];
  if (
    typeof threshold !== 'number' ||
    !Number.isInteger(threshold) ||
    threshold < 0 ||
    threshold > 1000000 ||
    typeof notifications !== 'boolean'
  )
    return invalid();
  result.lowStockThreshold = threshold;
  result.notificationsEnabled = notifications;
  return result;
}

export function parseCompany(value: unknown): CompanySettings {
  if (value === null) return { revision: 0, input: blankCompany() };
  if (!isRecord(value)) return invalid();
  const revision = value['revision'];
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1 || revision > 2147483647)
    return invalid();
  return { revision, input: companyInput(value) };
}

export function parseLogo(value: unknown): string {
  if (!isRecord(value) || value['kind'] !== 'COMPANY_LOGO') return invalid();
  const path = logoPath(value['url']);
  if (!path || path !== '/api/v1/media/images/' + storeId(value['id'])) return invalid();
  return path;
}
