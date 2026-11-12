import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { StoreRepository } from '../application/store.repository';
import { NewStore, Store } from '../domain/store';
@Injectable()
export class PrismaStoreRepository implements StoreRepository {
  constructor(private readonly prisma: PrismaService) {}
  findAll(): Promise<Store[]> { return this.prisma.store.findMany({ orderBy: { name: 'asc' } }); }
  findById(id: string): Promise<Store | null> { return this.prisma.store.findUnique({ where: { id } }); }
  findByCode(code: string): Promise<Store | null> { return this.prisma.store.findUnique({ where: { code } }); }
  async create(input: NewStore): Promise<Store> {
    try { return await this.prisma.store.create({ data: input }); }
    catch (error: unknown) { this.handle(error); throw error; }
  }
  async update(id: string, input: { name?: string; address?: string | null }): Promise<Store> {
    try { return await this.prisma.store.update({ where: { id }, data: input }); }
    catch (error: unknown) { this.handle(error); throw error; }
  }
  async setStatus(id: string, status: 'ACTIVE' | 'INACTIVE'): Promise<Store> {
    try { return await this.prisma.store.update({ where: { id }, data: { status } }); }
    catch (error: unknown) { this.handle(error); throw error; }
  }
  private handle(error: unknown): void {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return;
    if (error.code === 'P2002') throw new ConflictException('Ce code magasin existe déjà.');
    if (error.code === 'P2025') throw new NotFoundException('Magasin introuvable.');
  }
}
