import 'reflect-metadata';
import { BadRequestException, INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { of } from 'rxjs';
import { ImageController } from '../../modules/media/presentation/image.controller';
import { ImageService } from '../../modules/media/application/image.service';
import { IMAGE_REPOSITORY } from '../../modules/media/application/image.port';
import { NotificationsController } from '../../modules/notifications/presentation/notifications.controller';
import { NotificationsService } from '../../modules/notifications/application/notifications.service';
import { AccessGuard } from '../../modules/identity/presentation/access.guard';
import { RoutePolicyGuard } from '../../modules/identity/presentation/route-policy.guard';
import { TOKEN_SERVICE, USER_REPOSITORY, SESSION_REPOSITORY } from '../../modules/identity/application/ports';
import { frenchValidationErrors } from './french-validation';
import { SafeExceptionFilter } from './safe-exception.filter';
import { SuccessMessageInterceptor } from './success-message.interceptor';

describe('Contrats HTTP des notifications et images', () => {
  const actor = '00000000-0000-4000-8000-000000000001';
  const imageId = '00000000-0000-4000-8000-000000000002';
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DQAAAEgQGALFXOsAAAAABJRU5ErkJggg==',
    'base64',
  );
  const user = { id: actor, status: 'ACTIVE', tokenVersion: 1, permissions: ['users.manage','products.manage','products.read'] };
  const users = { findById: jest.fn() };
  const tokens = { verifyAccess: jest.fn() };
  const sessions = { findById: jest.fn() };
  const images = { save: jest.fn(), get: jest.fn(), latestProduct: jest.fn() };
  const notifications = {
    feed: jest.fn(), mark: jest.fn(),
    stream: jest.fn(() => of({ type: 'notifications', data: { unread: 1 } })),
  };
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ImageController, NotificationsController],
      providers: [
        AccessGuard, ImageService,
        { provide: IMAGE_REPOSITORY, useValue: images },
        { provide: NotificationsService, useValue: notifications },
        { provide: TOKEN_SERVICE, useValue: tokens },
        { provide: USER_REPOSITORY, useValue: users },
        { provide: SESSION_REPOSITORY, useValue: sessions },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalGuards(new RoutePolicyGuard(app.get(Reflector)));
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true, forbidNonWhitelisted: true, transform: true,
      exceptionFactory: (errors) => new BadRequestException(frenchValidationErrors(errors)),
    }));
    app.useGlobalFilters(new SafeExceptionFilter(app.get(HttpAdapterHost)));
    app.useGlobalInterceptors(new SuccessMessageInterceptor(app.get(Reflector)));
    await app.init();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    tokens.verifyAccess.mockResolvedValue({ sub: actor, ver: 1, sid: 'session', typ: 'access' });
    users.findById.mockResolvedValue(user);
    sessions.findById.mockResolvedValue({ userId: actor, revokedAt: null, expiresAt: new Date('2999-01-01') });
    images.save.mockResolvedValue({ id: imageId, mimeType: 'image/png', createdAt: new Date('2026-01-01') });
    images.get.mockResolvedValue({ mimeType: 'image/png', data: png });
    notifications.feed.mockResolvedValue({ enabled: true, unread: 0, items: [], pagination: { page: 2, limit: 10, total: 0, pages: 0 } });
  });
  afterAll(async () => { await app?.close(); });

  it('refuse la lecture anonyme et les sessions révoquées', async () => {
    await request(app.getHttpServer()).get('/api/v1/notifications').expect(401);
    sessions.findById.mockResolvedValue({ userId: actor, revokedAt: new Date(), expiresAt: new Date('2999-01-01') });
    await request(app.getHttpServer()).get('/api/v1/notifications').set('Authorization','Bearer test').expect(401);
    expect(notifications.feed).not.toHaveBeenCalled();
  });
  it('valide et transforme les filtres de pagination avant l’appel métier', async () => {
    await request(app.getHttpServer()).get('/api/v1/notifications?page=2&limit=10&read=false')
      .set('Authorization','Bearer test').expect(200);
    expect(notifications.feed).toHaveBeenCalledWith(actor, expect.objectContaining({ page: 2, limit: 10, read: false }));
    await request(app.getHttpServer()).get('/api/v1/notifications?limit=101')
      .set('Authorization','Bearer test').expect(400);
    expect(notifications.feed).toHaveBeenCalledTimes(1);
  });
  it('transmet le flux SSE uniquement à un utilisateur authentifié', async () => {
    await request(app.getHttpServer()).get('/api/v1/notifications/stream').expect(401);
    const res = await request(app.getHttpServer()).get('/api/v1/notifications/stream')
      .set('Authorization','Bearer test').expect(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.text).toContain('event: notifications');
    expect(res.text).toContain('{"unread":1}');
  });
  it('protège le téléversement du logo et retourne le message de succès', async () => {
    users.findById.mockResolvedValue({ ...user, permissions: ['products.read'] });
    await request(app.getHttpServer()).post('/api/v1/media/company/logo')
      .set('Authorization','Bearer test').attach('file', png, 'logo.png').expect(403);
    expect(images.save).not.toHaveBeenCalled();
    users.findById.mockResolvedValue(user);
    const res = await request(app.getHttpServer()).post('/api/v1/media/company/logo')
      .set('Authorization','Bearer test').attach('file', png, 'logo.png').expect(201);
    expect(images.save).toHaveBeenCalledWith(actor, expect.objectContaining({ kind: 'COMPANY_LOGO', mimeType: 'image/png' }));
    expect(decodeURIComponent(String(res.headers['x-success-message']))).toBe('Logo téléversé avec succès.');
  });
  it('refuse une image invalide sans enregistrer de données', async () => {
    await request(app.getHttpServer()).post('/api/v1/media/company/logo').set('Authorization','Bearer test')
      .attach('file', Buffer.from('contenu invalide'), 'fake.png').expect(400);
    expect(images.save).not.toHaveBeenCalled();
  });
  it('retourne les octets et le type MIME du fichier authentifié', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/media/images/' + imageId)
      .set('Authorization','Bearer test').expect(200).expect('Content-Type', /image\/png/);
    expect(res.body).toEqual(png);
  });
});
