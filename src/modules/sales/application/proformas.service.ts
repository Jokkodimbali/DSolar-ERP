import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PROFORMAS_REPOSITORY, ProformaInput, ProformasRepository } from './proformas.port';

@Injectable()
export class ProformasService {
  constructor(@Inject(PROFORMAS_REPOSITORY) private readonly proformas: ProformasRepository) {}
  list() {
    return this.proformas.list();
  }
  async get(id: string) {
    const result = await this.proformas.find(id);
    if (!result) throw new NotFoundException('Devis proforma introuvable.');
    return result;
  }
  async create(input: ProformaInput) {
    const number = input.number.trim().toUpperCase();
    if (!number || !input.lines.length) throw new BadRequestException('Numéro et lignes obligatoires.');
    const seen = new Set<string>();
    for (const line of input.lines) {
      if (
        line.quantity <= 0 ||
        line.unitPrice < 0 ||
        line.discount < 0 ||
        line.taxRate < 0 ||
        line.taxRate > 100 ||
        ![line.quantity, line.unitPrice, line.discount, line.taxRate].every(Number.isFinite)
      )
        throw new BadRequestException('Montants ou taux invalides.');
      const key = line.storeId + ':' + line.productId;
      if (seen.has(key)) throw new BadRequestException('Produit en double dans un magasin.');
      seen.add(key);
      const gross = new Prisma.Decimal(line.quantity).mul(line.unitPrice);
      if (new Prisma.Decimal(line.discount).gt(gross))
        throw new BadRequestException('La remise dépasse le montant de la ligne.');
    }
    this.validateExpiry(input.expiresAt);
    return this.proformas.create({ ...input, number });
  }
  async issue(id: string) {
    const proforma = await this.get(id);
    if (proforma.status !== 'DRAFT') throw new ConflictException('Seul un devis brouillon peut être émis.');
    this.ensureNotExpired(proforma.expiresAt);
    return this.proformas.issue(id);
  }

  async update(id: string, input: ProformaInput) {
    const current = await this.get(id);
    if (current.status !== 'DRAFT') throw new ConflictException('Seul un brouillon est modifiable.');
    const number = input.number.trim().toUpperCase();
    if (!number || !input.lines.length) throw new BadRequestException('Numéro et lignes obligatoires.');
    const seen = new Set<string>();
    for (const line of input.lines) {
      if (
        ![line.quantity, line.unitPrice, line.discount, line.taxRate].every(Number.isFinite) ||
        line.quantity <= 0 ||
        line.unitPrice < 0 ||
        line.discount < 0 ||
        line.taxRate < 0 ||
        line.taxRate > 100 ||
        new Prisma.Decimal(line.discount).gt(new Prisma.Decimal(line.quantity).mul(line.unitPrice))
      )
        throw new BadRequestException('Montants, remise ou taux invalides.');
      const key = line.storeId + ':' + line.productId;
      if (seen.has(key)) throw new BadRequestException('Ligne en double.');
      seen.add(key);
    }
    this.validateExpiry(input.expiresAt);
    return this.proformas.update(id, { ...input, number });
  }
  async accept(id: string) {
    const current = await this.get(id);
    if (current.status !== 'ISSUED') throw new ConflictException('Devis non émis.');
    this.ensureNotExpired(current.expiresAt);
    return this.proformas.transition(id, 'ISSUED', 'ACCEPTED');
  }
  async cancel(id: string) {
    const current = await this.get(id);
    if (current.status !== 'DRAFT' && current.status !== 'ISSUED')
      throw new ConflictException('Devis non annulable.');
    return this.proformas.transition(id, current.status, 'CANCELLED');
  }
  async expire(id: string) {
    const current = await this.get(id);
    if (current.status !== 'ISSUED') throw new ConflictException('Devis non émis.');
    return this.proformas.transition(id, 'ISSUED', 'EXPIRED');
  }

  private validateExpiry(expiresAt?: string) {
    if (expiresAt === undefined) return;
    const date = new Date(expiresAt);
    if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now())
      throw new BadRequestException('La date d’expiration doit être future.');
  }
  private ensureNotExpired(expiresAt: Date | null) {
    if (expiresAt && expiresAt.getTime() <= Date.now())
      throw new ConflictException('Ce devis a expiré.');
  }
}
