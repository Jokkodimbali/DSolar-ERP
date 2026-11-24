import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AccountingController } from './accounting.controller';
import { BankController } from './bank.controller';
import { AccountingService } from '../application/accounting.service';
import { BankService } from '../application/bank.service';
import { AccessGuard } from '../../identity/presentation/access.guard';
import { TOKEN_SERVICE, USER_REPOSITORY } from '../../identity/application/ports';

describe('Sécurité HTTP de la comptabilité', () => {
  let app: INestApplication;
  const actor = '00000000-0000-4000-8000-000000000001';
  const id = '00000000-0000-4000-8000-000000000002';
  const token = { verifyAccess: jest.fn() };
  const users = { findById: jest.fn() };
  const ledger = { setup: jest.fn(), post: jest.fn(), configureAutomation: jest.fn() };
  const bank = { accounts: jest.fn(), close: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AccountingController, BankController],
      providers: [
        AccessGuard,
        { provide: TOKEN_SERVICE, useValue: token },
        { provide: USER_REPOSITORY, useValue: users },
        { provide: AccountingService, useValue: ledger },
        { provide: BankService, useValue: bank },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  beforeEach(() => {
    jest.resetAllMocks();
    token.verifyAccess.mockResolvedValue({ sub: actor, ver: 1 });
    users.findById.mockResolvedValue({ id: actor, status: 'ACTIVE', tokenVersion: 1, permissions: ['users.manage'] });
    ledger.setup.mockResolvedValue({ accounts: [] });
    ledger.configureAutomation.mockResolvedValue({ enabled: false });
  });

  it.each(['/api/v1/accounting/setup','/api/v1/accounting/bank/accounts'])('refuse une lecture publique : %s', async (path) => {
    await request(app.getHttpServer()).get(path).expect(401);
    expect(ledger.setup).not.toHaveBeenCalled();
    expect(bank.accounts).not.toHaveBeenCalled();
  });

  it('refuse les écritures et clôtures d’un magasinier', async () => {
    users.findById.mockResolvedValue({ id: actor, status: 'ACTIVE', tokenVersion: 1,
      permissions: ['inventory.read','inventory.manage','stores.read','products.read'] });
    await request(app.getHttpServer()).get('/api/v1/accounting/setup').set('Authorization','Bearer valid').expect(403);
    await request(app.getHttpServer()).post('/api/v1/accounting/entries').set('Authorization','Bearer valid').send({}).expect(403);
    await request(app.getHttpServer()).post('/api/v1/accounting/bank/statements/' + id + '/close').set('Authorization','Bearer valid').expect(403);
    expect(ledger.post).not.toHaveBeenCalled();
    expect(bank.close).not.toHaveBeenCalled();
  });

  it('refuse un jeton révoqué et un compte désactivé', async () => {
    users.findById.mockResolvedValue({ id: actor, status: 'ACTIVE', tokenVersion: 2, permissions: ['users.manage'] });
    await request(app.getHttpServer()).get('/api/v1/accounting/setup').set('Authorization','Bearer valid').expect(401);
    users.findById.mockResolvedValue({ id: actor, status: 'INACTIVE', tokenVersion: 1, permissions: ['users.manage'] });
    await request(app.getHttpServer()).get('/api/v1/accounting/setup').set('Authorization','Bearer valid').expect(401);
    expect(ledger.setup).not.toHaveBeenCalled();
  });

  it('rejette l’injection de champs et la conversion ambiguë des booléens', async () => {
    const path = '/api/v1/accounting/periods/' + id + '/automation';
    await request(app.getHttpServer()).post(path).set('Authorization','Bearer valid').send({ enabled: false, actorId: id }).expect(400);
    await request(app.getHttpServer()).post(path).set('Authorization','Bearer valid').send({ enabled: 'false' }).expect(400);
    expect(ledger.configureAutomation).not.toHaveBeenCalled();
    await request(app.getHttpServer()).post(path).set('Authorization','Bearer valid').send({ enabled: false }).expect(201);
    expect(ledger.configureAutomation).toHaveBeenCalledWith(id, false, actor);
  });

  it('rejette un identifiant invalide avant l’appel du service', async () => {
    await request(app.getHttpServer()).post('/api/v1/accounting/bank/statements/not-a-uuid/close').set('Authorization','Bearer valid').expect(400);
    expect(bank.close).not.toHaveBeenCalled();
  });

  it('utilise uniquement l’identité authentifiée pour les lectures', async () => {
    await request(app.getHttpServer()).get('/api/v1/accounting/setup?actorId=' + id).set('Authorization','Bearer valid').expect(200);
    expect(ledger.setup).toHaveBeenCalledWith(actor);
  });
});
