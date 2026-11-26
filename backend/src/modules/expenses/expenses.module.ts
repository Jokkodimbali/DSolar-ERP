import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { EXPENSES } from './application/expenses.port';
import { ExpensesService } from './application/expenses.service';
import { ExpensesRepository } from './infrastructure/expenses.repository';
import { ExpensesController } from './presentation/expenses.controller';

@Module({
  imports: [PrismaModule, IdentityModule],
  controllers: [ExpensesController],
  providers: [ExpensesService, { provide: EXPENSES, useClass: ExpensesRepository }],
})
export class ExpensesModule {}
