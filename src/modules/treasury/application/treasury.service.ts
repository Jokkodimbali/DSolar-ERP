import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { TREASURY, TreasuryPort } from './treasury.port';

@Injectable()
export class TreasuryService {
  constructor(@Inject(TREASURY) private readonly repository: TreasuryPort) {}

  private money(value: string, signed = false): string {
    if (typeof value !== 'string' || !/^-?\d{1,16}(\.\d{1,2})?$/.test(value) || (!signed && value.startsWith('-')))
      throw new BadRequestException('Montant invalide.');
    return value;
  }

  list(actor: string) {
    return this.repository.list(actor);
  }

  create(store: string, name: string, actor: string) {
    if (!name.trim() || name.trim().length > 100) throw new BadRequestException('Nom invalide.');
    return this.repository.create(store, name.trim(), actor);
  }

  open(register: string, amount: string, actor: string) {
    return this.repository.open(register, this.money(amount), actor);
  }

  move(session: string, amount: string, reason: string, key: string, actor: string) {
    this.money(amount, true);
    if (Number(amount) === 0 || !reason.trim() || reason.trim().length > 200)
      throw new BadRequestException('Mouvement invalide.');
    return this.repository.move(session, amount, reason.trim(), key, actor);
  }

  close(session: string, counted: string, actor: string) {
    return this.repository.close(session, this.money(counted), actor);
  }
}
