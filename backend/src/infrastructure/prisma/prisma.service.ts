import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { assertRuntimePrivileges } from './runtime-privileges';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
    try {
      if (process.env.DB_REQUIRE_RESTRICTED_ROLE === 'true') await assertRuntimePrivileges(this);
    } catch (error) {
      await this.$disconnect();
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
