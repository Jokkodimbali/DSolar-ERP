import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { COMPANY_SETTINGS, CompanySettingsInput, CompanySettingsPort } from './company-settings.port';

@Injectable()
export class CompanySettingsService {
  constructor(@Inject(COMPANY_SETTINGS) private readonly repository: CompanySettingsPort) {}

  current(actorId: string) {
    return this.repository.current(actorId);
  }

  save(actorId: string, expectedRevision: number, input: CompanySettingsInput) {
    const normalized = {
      ...input,
      legalName: input.legalName.trim(),
      tradeName: input.tradeName.trim(),
      taxId: input.taxId.trim(),
      registrationNumber: input.registrationNumber.trim(),
      legalForm: input.legalForm.trim(),
      address: input.address.trim(),
      phone: input.phone.trim(),
      email: input.email.trim(),
      website: input.website.trim(),
      logoUrl: input.logoUrl.trim(),
      bankName: input.bankName.trim(),
      bankAccount: input.bankAccount.trim(),
      documentFooter: input.documentFooter.trim(),
    };
    if (!normalized.legalName) throw new BadRequestException('Raison sociale obligatoire.');
    for (const value of [normalized.website, normalized.logoUrl]) {
      if (!value) continue;
      try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
      } catch {
        throw new BadRequestException('Les liens doivent être des URL HTTPS sans identifiants.');
      }
    }
    return this.repository.save(actorId, expectedRevision, normalized);
  }
}
