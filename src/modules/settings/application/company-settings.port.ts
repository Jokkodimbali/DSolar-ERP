export const COMPANY_SETTINGS = Symbol('COMPANY_SETTINGS');

export interface CompanySettingsInput {
  legalName: string;
  tradeName: string;
  taxId: string;
  registrationNumber: string;
  legalForm: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  logoUrl: string;
  bankName: string;
  bankAccount: string;
  documentFooter: string;
  notificationsEnabled: boolean;
  lowStockThreshold: number;
}

export interface CompanySettingsRevision extends CompanySettingsInput {
  id: string;
  revision: number;
  createdAt: Date;
}

export interface CompanySettingsPort {
  current(actorId: string): Promise<CompanySettingsRevision | null>;
  save(
    actorId: string,
    expectedRevision: number,
    input: CompanySettingsInput,
  ): Promise<CompanySettingsRevision>;
}
