import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Module technique : seul le code Infrastructure peut injecter PrismaService.
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
