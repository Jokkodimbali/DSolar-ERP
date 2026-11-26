import { AccountingPort } from '../application/accounting.port';
import { LedgerAutomationWorker } from './ledger-automation.worker';

describe('Automatisation comptable', () => {
  const initialNodeEnv = process.env.NODE_ENV;
  const initialWorker = process.env.LEDGER_AUTOMATION_WORKER;
  const runAutomaticCycle = jest.fn();
  let worker: LedgerAutomationWorker;

  beforeEach(() => {
    jest.useFakeTimers();
    process.env.NODE_ENV = 'development';
    delete process.env.LEDGER_AUTOMATION_WORKER;
    runAutomaticCycle.mockReset().mockResolvedValue({ processed: 0, failed: 0 });
    worker = new LedgerAutomationWorker({ runAutomaticCycle } as unknown as AccountingPort);
  });

  afterEach(async () => {
    await worker.onModuleDestroy();
    jest.useRealTimers();
    if (initialNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = initialNodeEnv;
    if (initialWorker === undefined) delete process.env.LEDGER_AUTOMATION_WORKER;
    else process.env.LEDGER_AUTOMATION_WORKER = initialWorker;
  });

  it('démarre automatiquement sans configuration supplémentaire', async () => {
    worker.onModuleInit();
    expect(runAutomaticCycle).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(60000);
    expect(runAutomaticCycle).toHaveBeenCalledTimes(2);
  });

  it('respecte un arrêt explicite', async () => {
    process.env.LEDGER_AUTOMATION_WORKER = 'false';
    worker.onModuleInit();
    await jest.advanceTimersByTimeAsync(60000);
    expect(runAutomaticCycle).not.toHaveBeenCalled();
  });

  it('ne lance pas de cycle pendant les tests', async () => {
    process.env.NODE_ENV = 'test';
    process.env.LEDGER_AUTOMATION_WORKER = 'true';
    worker.onModuleInit();
    await jest.advanceTimersByTimeAsync(60000);
    expect(runAutomaticCycle).not.toHaveBeenCalled();
  });
});
