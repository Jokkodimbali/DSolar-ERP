import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { BootstrapService } from '../modules/identity/application/bootstrap.service';
async function run(): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const name = process.env.ADMIN_NAME;
  const password = process.env.ADMIN_PASSWORD;
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
