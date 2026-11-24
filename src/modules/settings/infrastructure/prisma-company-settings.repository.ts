import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { CompanySettingsInput, CompanySettingsPort } from '../application/company-settings.port';

@Injectable()
export class PrismaCompanySettingsRepository implements CompanySettingsPort {
  constructor(private readonly prisma: PrismaService) {}

  private async authorize(tx: Prisma.TransactionClient, actorId: string): Promise<void> {
    const admin = await tx.user.findFirst({
      where: { id: actorId, status: 'ACTIVE', roles: { some: { role: { code: 'ADMIN' } } } },
      select: { id: true },
    });
    if (!admin) throw new ForbiddenException('Paramètres réservés au super administrateur.');
  }

  current(actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.authorize(tx, actorId);
      return tx.companySettings.findFirst({ orderBy: { revision: 'desc' } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async save(actorId: string, expectedRevision: number, input: CompanySettingsInput) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.authorize(tx, actorId);
        const current = await tx.companySettings.findFirst({ orderBy: { revision: 'desc' }, select: { revision: true } });
        if ((current?.revision ?? 0) !== expectedRevision)
          throw new ConflictException('Les paramètres ont changé. Rechargez la dernière version.');
        const created = await tx.companySettings.create({ data: { ...input, revision: expectedRevision + 1 } });
        await tx.auditLog.create({
          data: {
            actorId, action: 'COMPANY_SETTINGS_UPDATED', entityType: 'CompanySettings', entityId: created.id,
            payload: { revision: created.revision },
          },
        });
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code))
        throw new ConflictException('Modification concurrente des paramètres. Rechargez la dernière version.');
      throw error;
    }
  }
}
