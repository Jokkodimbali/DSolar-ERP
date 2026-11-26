import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ACCOUNTING, AccountingPort } from '../application/accounting.port';

@Injectable()
export class LedgerAutomationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LedgerAutomationWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private active?: Promise<void>;

  constructor(@Inject(ACCOUNTING) private readonly repository: AccountingPort) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.LEDGER_AUTOMATION_WORKER === 'false') return;
    this.timer = setInterval(() => this.tick(), 60000);
    this.timer.unref();
    this.tick();
  }

  private tick() {
    if (this.active) return;
    this.active = this.repository
      .runAutomaticCycle()
      .then((result) => {
        if (result.failed)
          this.logger.warn('Pièces comptables en attente de régularisation : ' + result.failed);
      })
      .catch(() => this.logger.error('Échec du cycle comptable automatique.'))
      .finally(() => {
        this.active = undefined;
      });
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.active;
  }
}
