import { INestApplication } from '@nestjs/common';
import { MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { REQUIRED_PERMISSIONS } from '../../modules/identity/presentation/access.guard';
import { PUBLIC_ROUTE } from '../../modules/identity/presentation/route-policy';
import { SUCCESS_MESSAGE } from './success-message.interceptor';

type Operation = NonNullable<OpenAPIObject['paths'][string]['get']>;
type Schema = NonNullable<NonNullable<OpenAPIObject['components']>['schemas']>[string];
type Response = Operation['responses'][string];

const uuid = { type: 'string' as const, format: 'uuid' };
const text = { type: 'string' as const };
const date = { type: 'string' as const, format: 'date-time' };
const integer = { type: 'integer' as const, minimum: 0 };
const boolean = { type: 'boolean' as const };
const money = { type: 'string' as const, pattern: '^-?[0-9]+[.][0-9]{2}$', example: '100.00' };
const ref = (name: string) => ({ $ref: '#/components/schemas/' + name });
const array = (items: Schema): Schema => ({ type: 'array', items });
const object = (properties: Record<string, Schema>, required = Object.keys(properties)): Schema => ({
  type: 'object',
  properties,
  required,
});
const errors: Record<string, string> = {
  '400': 'Données invalides ou contraintes de validation non respectées.',
  '401': 'Authentification requise, identifiants invalides ou session expirée.',
  '403': 'Permission, rôle ou accès au magasin insuffisant.',
  '404': 'Ressource introuvable ou hors du périmètre autorisé.',
  '409': 'Conflit métier, version obsolète ou opération concurrente.',
  '413': 'Fichier ou requête trop volumineux.',
  '415': 'Type de contenu non pris en charge.',
  '429': 'Trop de tentatives. Réessayez ultérieurement.',
  '500': 'Erreur technique du serveur.',
  '503': 'Service temporairement indisponible.',
};

const schemas: Record<string, Schema> = {
  ApiError: object({
    statusCode: integer,
    message: { oneOf: [text, array(text)] },
  }),
  ApiPublicIdentity: object({
    id: uuid,
    email: { ...text, format: 'email' },
    nomComplet: text,
    permissions: array(text),
    magasinsAutorises: array(uuid),
  }),
  ApiAuthResult: object({
    jetonAcces: text,
    jetonRenouvellement: text,
    utilisateur: ref('ApiPublicIdentity'),
  }),
  ApiMessage: object({ message: text }),
  ApiPagination: object({ page: integer, limit: integer, total: integer, pages: integer }),
  ApiPage: object({
    items: array({ type: 'object', additionalProperties: true }),
    pagination: ref('ApiPagination'),
  }),
  ApiNotification: object({
    id: uuid,
    title: text,
    action: text,
    entityType: text,
    entityId: text,
    storeId: { ...uuid, nullable: true },
    createdAt: date,
    read: boolean,
  }),
  ApiNotificationFeed: object(
    {
      enabled: boolean,
      unread: integer,
      items: array(ref('ApiNotification')),
      pagination: ref('ApiPagination'),
    },
    ['enabled', 'unread', 'items'],
  ),
  ApiNotificationMark: object({ marked: integer, message: text }),
  ApiImage: object({ id: uuid, mimeType: text, createdAt: date, url: text }),
  ApiImageUpload: object({ id: uuid, mimeType: text, createdAt: date, url: text, message: text }),
  ApiPaymentItem: object({
    id: uuid,
    installmentNumber: integer,
    amount: money,
    method: text,
    receivedAt: date,
    status: { ...text, enum: ['ACTIVE', 'REVERSED'] },
    reversedAmount: money,
    reversedAt: { ...date, nullable: true },
  }),
  ApiPaymentSummary: object({
    orderId: uuid,
    currency: { ...text, enum: ['XOF'] },
    basis: { ...text, enum: ['SALES_ORDER_NET_OF_INVOICE_CREDITS'] },
    orderStatus: text,
    paymentStatus: text,
    netPaymentStatus: text,
    total: money,
    credited: money,
    netTotal: money,
    paid: money,
    remaining: money,
    activeInstallments: integer,
    maxInstallments: { ...integer, enum: [2] },
    consistent: boolean,
    canRecord: boolean,
    nextPaymentMustSettle: boolean,
    payments: array(ref('ApiPaymentItem')),
  }),
};

export function swaggerEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === 'development' && env.ENABLE_SWAGGER === 'true';
}

function successSchema(path: string, method: string): Schema | undefined {
  if (path === '/api/v1/auth/login' || path === '/api/v1/auth/refresh') return ref('ApiAuthResult');
  if (path === '/api/v1/auth/logout') return ref('ApiMessage');
  if (path === '/api/v1/auth/me') return ref('ApiPublicIdentity');
  if (path === '/api/v1/notifications' && method === 'get') return ref('ApiNotificationFeed');
  if (path.startsWith('/api/v1/notifications/') && method === 'post') return ref('ApiNotificationMark');
  if (path.startsWith('/api/v1/media/') && method === 'post') return ref('ApiImageUpload');
  if (path === '/api/v1/media/products/{id}/photo' && method === 'get')
    return { allOf: [ref('ApiImage')], nullable: true };
  if (path === '/api/v1/sales-orders/{orderId}/payments/summary') return ref('ApiPaymentSummary');
  if (method === 'get' && (path.startsWith('/api/v1/search/') || path.endsWith('/search')))
    return ref('ApiPage');
  return undefined;
}

function describeResponse(path: string, method: string, operation: Operation, message?: string) {
  const status = method === 'post' ? '201' : '200';
  const existing = operation.responses[status];
  const response: Response = {
    ...(existing && !('$ref' in existing) ? existing : {}),
    description: message ?? 'Opération réussie.',
  };
  const binary = { schema: { type: 'string' as const, format: 'binary' } };
  if (path.endsWith('/pdf')) response.content = { 'application/pdf': binary };
  else if (path.endsWith('.csv')) response.content = { 'text/csv': { schema: text } };
  else if (path.startsWith('/api/v1/media/images/'))
    response.content = { 'image/png': binary, 'image/jpeg': binary };
  else if (path === '/api/v1/notifications/stream') {
    response.description =
      'Flux SSE authentifié, interrogation toutes les 5 secondes, fermeture après 60 secondes.';
    response.content = {
      'text/event-stream': {
        schema: text,
        example: 'event: notifications\ndata: {"enabled":true,"unread":0,"items":[]}\n\n',
      },
    };
  } else {
    const schema = successSchema(path, method);
    if (schema) response.content = { 'application/json': { schema } };
  }
  if (['post', 'put', 'patch', 'delete'].includes(method)) {
    response.headers = {
      ...response.headers,
      'X-Success-Message': {
        description: 'Confirmation en français, encodée avec encodeURIComponent.',
        schema: text,
      },
    };
  }
  operation.responses[status] = response;
  for (const [code, description] of Object.entries(errors)) {
    if (
      (code === '401' || code === '403') &&
      !operation.security?.length &&
      !path.startsWith('/api/v1/auth/')
    )
      continue;
    if (code === '429' && !path.startsWith('/api/v1/auth/')) continue;
    if ((code === '413' || code === '415') && !path.startsWith('/api/v1/media/')) continue;
    operation.responses[code] ??= {
      description,
      content: { 'application/json': { schema: ref('ApiError') } },
    };
  }
}

export function createApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('DSolar-ERP — API interne')
    .setDescription(
      'Documentation technique de D-Solar and Agri. Les opérations sont réelles : utiliser une base de développement isolée. Les droits de route sont complétés par les contrôles métier et de magasin.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Jeton d’accès obtenu via POST /api/v1/auth/login.',
      },
      'bearer',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controller, method) => controller + '_' + method,
  });
  document.components = { ...document.components, schemas: { ...document.components?.schemas, ...schemas } };

  const reflector = app.get(Reflector);
  const scanner = new MetadataScanner();
  const handlers = new Map<string, { public: boolean; permissions: string[]; message?: string }>();
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype;
      if (!controller) continue;
      const prototype = controller.prototype as Record<string, unknown>;
      for (const name of scanner.getAllMethodNames(prototype)) {
        const handler = prototype[name];
        if (typeof handler !== 'function') continue;
        handlers.set(controller.name + '_' + name, {
          public: reflector.get<boolean>(PUBLIC_ROUTE, handler) === true,
          permissions:
            reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [handler, controller]) ?? [],
          message: reflector.get<string>(SUCCESS_MESSAGE, handler),
        });
      }
    }
  }
  for (const [path, item] of Object.entries(document.paths)) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      const operation = item[method];
      if (!operation) continue;
      const handler = handlers.get(operation.operationId ?? '');
      if (!handler) throw new Error('Route OpenAPI sans handler : ' + method + ' ' + path);
      operation.security = handler.public ? [] : [{ bearer: [] }];
      operation.description = [
        operation.description,
        handler.public ? 'Route publique.' : 'Session JWT active requise.',
        handler.permissions.length ? 'Permissions : ' + handler.permissions.join(', ') + '.' : '',
      ]
        .filter(Boolean)
        .join(' ');
      operation.summary ||=
        handler.message ??
        (method === 'get' ? 'Consulter ' : 'Exécuter ') +
          (operation.tags?.join(' — ') ?? 'API') +
          ' : ' +
          path.slice(8);
      for (const parameter of operation.parameters ?? []) {
        if ('$ref' in parameter) continue;
        if (parameter.in === 'path') {
          parameter.required = true;
          parameter.schema = { type: 'string', format: 'uuid' };
        }
        if (parameter.in === 'query' && parameter.name !== 'year' && parameter.required === undefined)
          parameter.required = false;
      }
      if (path.startsWith('/api/v1/media/') && method === 'post') {
        operation.requestBody = {
          required: true,
          content: {
            'multipart/form-data': {
              schema: object({
                file: {
                  type: 'string',
                  format: 'binary',
                  description: 'PNG ou JPEG compatible, maximum 2 Mio et 4 mégapixels.',
                },
              }),
            },
          },
        };
      }
      describeResponse(path, method, operation, handler.message);
    }
  }
  return document;
}

export function configureSwagger(app: INestApplication, env: NodeJS.ProcessEnv): void {
  if (!swaggerEnabled(env)) return;
  SwaggerModule.setup('documentation', app, createApiDocument(app), {
    swaggerOptions: {
      persistAuthorization: false,
      docExpansion: 'none',
      filter: true,
      displayRequestDuration: true,
    },
    customSiteTitle: 'DSolar-ERP — Documentation API',
  });
}
