import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { isEmail } from 'class-validator';
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
      timeZone: input.timeZone?.trim() || 'Africa/Dakar',
    };
    if (!normalized.legalName) throw new BadRequestException('Raison sociale obligatoire.');
    if (normalized.email && !isEmail(normalized.email))
      throw new BadRequestException('L’adresse électronique de l’entreprise est invalide.');
    try {
      new Intl.DateTimeFormat('fr-SN', { timeZone: normalized.timeZone });
    } catch {
      throw new BadRequestException('Fuseau horaire invalide. Utilisez un identifiant IANA, par exemple Africa/Dakar.');
    }
    if (
      normalized.logoUrl &&
      !/^\/api\/v1\/media\/images\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        normalized.logoUrl,
      )
    )
      throw new BadRequestException('Le logo doit être téléversé depuis le formulaire de l’entreprise.');
    for (const value of [normalized.website]) {
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
