import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { calculateSalesTotals } from '../domain/sales-pricing';
import { PROFORMAS_REPOSITORY, ProformaInput, ProformasRepository } from './proformas.port';

@Injectable()
export class ProformasService {
  constructor(@Inject(PROFORMAS_REPOSITORY) private readonly proformas: ProformasRepository) {}
  list(actorId: string) {
    return this.proformas.list(actorId);
  }
  async get(id: string, actorId: string) {
    const result = await this.proformas.find(id, actorId);
    if (!result) throw new NotFoundException('Devis proforma introuvable.');
    return result;
  }
  async create(input: ProformaInput, actorId: string) {
    const number = input.number?.trim().toUpperCase() || `PF-${randomUUID().slice(0, 12).toUpperCase()}`;
    this.validateLines(input);
    this.validateExpiry(input.expiresAt);
    return this.proformas.create({ ...input, number }, actorId);
  }
  async issue(id: string, actorId: string) {
    const proforma = await this.get(id, actorId);
    if (proforma.status !== 'DRAFT') throw new ConflictException('Seul un devis brouillon peut être émis.');
    this.ensureNotExpired(proforma.expiresAt);
    return this.proformas.issue(id, actorId);
  }

  async update(id: string, input: ProformaInput, actorId: string) {
    const current = await this.get(id, actorId);
    if (current.status !== 'DRAFT') throw new ConflictException('Seul un brouillon est modifiable.');
    const number = input.number?.trim().toUpperCase();
    this.validateLines(input);
    this.validateExpiry(input.expiresAt);
    return this.proformas.update(id, { ...input, ...(number ? { number } : {}) }, actorId);
  }
  async accept(id: string, actorId: string) {
    const current = await this.get(id, actorId);
    if (current.status !== 'ISSUED') throw new ConflictException('Devis non émis.');
    this.ensureNotExpired(current.expiresAt);
    return this.proformas.transition(id, 'ISSUED', 'ACCEPTED', actorId);
  }
  async cancel(id: string, actorId: string) {
    const current = await this.get(id, actorId);
    if (current.status !== 'DRAFT' && current.status !== 'ISSUED')
      throw new ConflictException('Devis non annulable.');
    return this.proformas.transition(id, current.status, 'CANCELLED', actorId);
  }
  async expire(id: string, actorId: string) {
    return this.proformas.transition(id, 'ISSUED', 'EXPIRED', actorId);
  }

  private validateLines(input: ProformaInput) {
    const seen = new Set<string>();
    for (const line of input.lines) {
      if (![line.quantity, line.unitPrice, line.discount, line.taxRate].every(Number.isFinite))
        throw new BadRequestException('Montants ou taux invalides.');
      const key = line.storeId + ':' + line.productId;
      if (seen.has(key)) throw new BadRequestException('Produit en double dans un magasin.');
      seen.add(key);
    }
    try {
      calculateSalesTotals(
        input.lines.map((line) => ({
          quantity: String(line.quantity),
          unitPrice: String(line.unitPrice),
          discount: String(line.discount),
          taxRate: String(line.taxRate),
        })),
      );
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Montants invalides.');
    }
  }

  private validateExpiry(expiresAt?: string) {
    if (expiresAt === undefined) return;
    const date = new Date(expiresAt);
    if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now())
      throw new BadRequestException('La date d’expiration doit être future.');
  }
  private ensureNotExpired(expiresAt: Date | null) {
    if (expiresAt && expiresAt.getTime() <= Date.now()) throw new ConflictException('Ce devis a expiré.');
  }
}
