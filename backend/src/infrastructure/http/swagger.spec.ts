import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OpenAPIObject } from '@nestjs/swagger';
import { AppModule } from '../../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { createApiDocument, swaggerEnabled } from './swagger';

describe('Documentation OpenAPI DSolar-ERP', () => {
  let app: INestApplication;
  let doc: OpenAPIObject;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    doc = createApiDocument(app);
  });
  afterAll(async () => { await app?.close(); });

  it('ne permet Swagger qu’en développement explicitement autorisé', () => {
    expect(swaggerEnabled({ NODE_ENV: 'development', ENABLE_SWAGGER: 'true' })).toBe(true);
    for (const NODE_ENV of ['production', 'test', 'development']) {
      expect(swaggerEnabled({ NODE_ENV, ENABLE_SWAGGER: 'false' })).toBe(false);
    }
    expect(swaggerEnabled({ NODE_ENV: 'production', ENABLE_SWAGGER: 'true' })).toBe(false);
    expect(swaggerEnabled({ ENABLE_SWAGGER: 'true' })).toBe(false);
  });
  it('décrit toutes les routes et exige Bearer hors des quatre routes publiques', () => {
    const operations = Object.entries(doc.paths).flatMap(([path, item]) =>
      (['get','post','put','patch','delete'] as const).flatMap(method => item[method] ? [{path, method, operation: item[method]}] : []));
    expect(operations).toHaveLength(214);
    expect(operations.filter(row => row.operation.security?.length === 0).map(row => row.method + ' ' + row.path).sort()).toEqual([
      'get /api/v1/health', 'post /api/v1/auth/login', 'post /api/v1/auth/logout', 'post /api/v1/auth/refresh',
    ]);
    expect(operations.every(row => row.operation.summary && row.operation.responses['500'])).toBe(true);
    expect(doc.components?.securitySchemes?.bearer).toMatchObject({ type: 'http', scheme: 'bearer' });
  });
  it('décrit les champs, contraintes, énumérations et DTO imbriqués', () => {
    const schemas = doc.components?.schemas;
    expect(schemas?.RecordPaymentDto).toMatchObject({ required: ['amount','method','idempotencyKey'], properties: {
      amount: { type: 'string', pattern: expect.any(String) }, method: { enum: expect.arrayContaining(['CASH','MOBILE_MONEY']) }, idempotencyKey: { minLength: 8, maxLength: 128 },
    } });
    expect(schemas?.ProformasCreateProformaDto).toMatchObject({ properties: { lines: { type: 'array', items: { $ref: '#/components/schemas/ProformasProformaLineDto' } } } });
    expect(doc.paths['/api/v1/products/search'].get?.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'page', in: 'query', required: false }),
      expect.objectContaining({ name: 'search', in: 'query', required: false }),
      expect.objectContaining({ name: 'active', in: 'query', required: false }),
    ]));
  });
  it('décrit les fichiers, SSE, erreurs et le résumé financier', () => {
    expect(doc.paths['/api/v1/media/company/logo'].post?.requestBody).toMatchObject({
      content: { 'multipart/form-data': { schema: { properties: { file: { type: 'string', format: 'binary' } } } } },
    });
    expect(doc.paths['/api/v1/invoices/{id}/pdf'].get?.responses['200']).toMatchObject({ content: { 'application/pdf': { schema: { format: 'binary' } } } });
    expect(doc.paths['/api/v1/notifications/stream'].get?.responses['200']).toMatchObject({ content: { 'text/event-stream': { schema: { type: 'string' } } } });
    expect(doc.paths['/api/v1/sales-orders/{orderId}/payments/summary'].get?.responses['200']).toMatchObject({ content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiPaymentSummary' } } } });
    expect(doc.paths['/api/v1/auth/login'].post?.responses['400']).toMatchObject({ content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } });
  });
});
