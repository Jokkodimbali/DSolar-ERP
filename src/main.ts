import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));
  const origins = (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean);
  app.enableCors({ origin: origins });
  const config = new DocumentBuilder()
    .setTitle('DSolar ERP — API')
    .setDescription('API de gestion interne D-Solar and Agri SARL')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup('documentation', app, SwaggerModule.createDocument(app, config));
  await app.listen(Number(process.env.PORT ?? 3000));
}
void bootstrap();
