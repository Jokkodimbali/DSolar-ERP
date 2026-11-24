import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configuredOrigins, securityHeaders, trustedProxyHops } from './infrastructure/http/http-security';
import { frenchValidationErrors } from './infrastructure/http/french-validation';
import { SuccessMessageInterceptor } from './infrastructure/http/success-message.interceptor';
import { SafeExceptionFilter } from './infrastructure/http/safe-exception.filter';
import { validatedJwtSecrets } from './modules/identity/infrastructure/jwt-configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  validatedJwtSecrets(process.env);
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.getHttpAdapter().getInstance().set('trust proxy', trustedProxyHops(process.env.TRUST_PROXY_HOPS));
  app.use(securityHeaders);
  app.useGlobalFilters(new SafeExceptionFilter(app.get(HttpAdapterHost)));
  app.useGlobalInterceptors(new SuccessMessageInterceptor(app.get(Reflector)));
  app.enableShutdownHooks();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validationError: { target: false, value: false },
      exceptionFactory: (errors) => new BadRequestException(frenchValidationErrors(errors)),
    }),
  );
  const origins = configuredOrigins(process.env.CORS_ORIGINS);
  app.enableCors({ origin: origins, exposedHeaders: ['X-Success-Message'] });
  if (process.env.NODE_ENV === 'development' && process.env.ENABLE_SWAGGER === 'true') {
    const config = new DocumentBuilder()
      .setTitle('DSolar ERP — API')
      .setDescription('API de gestion interne D-Solar and Agri SARL')
      .setVersion('1.0')
      .build();
    SwaggerModule.setup('documentation', app, SwaggerModule.createDocument(app, config));
  }
  await app.listen(Number(process.env.PORT ?? 3000));
}
void bootstrap();
