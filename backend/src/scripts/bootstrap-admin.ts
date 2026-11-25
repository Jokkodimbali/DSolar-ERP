import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { BootstrapService } from '../modules/identity/application/bootstrap.service';
// Identifiants de test uniquement : ne jamais les utiliser en production.
const developmentAdmin = {
  email: 'admin@dsolar.sn',
  name: 'Super Administrateur',
  password: 'Password123!',
};

function isDevelopmentDatabase(): boolean {
  const host = 'ep-spring-base-be9h3hza.c-9.us-east-2.aws.neon.tech';
  if (process.env.NODE_ENV !== 'development') return false;
  return [process.env.DATABASE_URL, process.env.DIRECT_URL].every((value) => {
    if (!value) return false;
    try {
      const url = new URL(value);
      return url.hostname === host && url.pathname === '/dsolar_erp';
    } catch {
      return false;
    }
  });
}

async function run(): Promise<void> {
  const development = isDevelopmentDatabase();
  const email = development ? developmentAdmin.email : process.env.ADMIN_EMAIL;
  const name = development ? developmentAdmin.name : process.env.ADMIN_NAME;
  const password = development ? developmentAdmin.password : process.env.ADMIN_PASSWORD;
  if (!development && password === developmentAdmin.password)
    throw new Error('Le mot de passe de test est réservé à la branche Neon develop.');
  if (!email || !name || !password)
    throw new Error('ADMIN_EMAIL, ADMIN_NAME et ADMIN_PASSWORD sont obligatoires.');
  const context = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const result = await context.get(BootstrapService).initialize(email, name, password);
    process.stdout.write(
      result === 'created'
        ? 'Administrateur initial créé.\n'
        : 'Initialisation ignorée : des utilisateurs existent déjà.\n',
    );
  } finally {
    await context.close();
  }
}
run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Erreur inconnue'}\n`);
  process.exitCode = 1;
});
