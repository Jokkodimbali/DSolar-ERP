import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MovementType, Prisma, TransferStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { CreateTransferInput, ReceiveTransferInput, TransferRepository } from '../application/transfers.port';

const D = (value: string | Prisma.Decimal) => new Prisma.Decimal(value);
@Injectable()
export class PrismaTransfersRepository implements TransferRepository {
  constructor(private readonly prisma: PrismaService) {}
  private async access(tx: Prisma.TransactionClient, storeId: string, userId: string) {
    const [user, store, access] = await Promise.all([
      tx.user.findUnique({where:{id:userId},select:{status:true}}),
      tx.store.findUnique({where:{id:storeId},select:{status:true}}),
      tx.userStoreAccess.findUnique({where:{userId_storeId:{userId,storeId}}})
    ]);
    if (!user || user.status!=='ACTIVE' || !access) throw new ForbiddenException('Accès au magasin interdit.');
    if (!store || store.status!=='ACTIVE') throw new ConflictException('Magasin inexistant ou inactif.');
  }
  private async load(tx:Prisma.TransactionClient,id:string,actorId:string,scope:'origin'|'destination'|'both'='both') {
    const transfer=await tx.stockTransfer.findUnique({where:{id},include:{lines:true}});
    if(!transfer) throw new NotFoundException('Transfert introuvable.');
    if(scope!=='destination') await this.access(tx,transfer.originId,actorId);
    if(scope!=='origin') await this.access(tx,transfer.destinationId,actorId);
    return transfer;
  }
  private async atomic<T>(fn:(tx:Prisma.TransactionClient)=>Promise<T>):Promise<T> {
    for(let attempt=0;attempt<3;attempt++){
      try { return await this.prisma.$transaction(fn,{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:15000}); }
      catch(error){
        if(error instanceof Prisma.PrismaClientKnownRequestError && error.code==='P2034' && attempt<2) continue;
        if(error instanceof Prisma.PrismaClientKnownRequestError && error.code==='P2002')
          throw new ConflictException('Référence déjà utilisée ou conflit d’unicité.');
        if(error instanceof Prisma.PrismaClientKnownRequestError && error.code==='P2034')
          throw new ConflictException('Conflit concurrent, veuillez réessayer.');
        throw error;
      }
    }
    throw new ConflictException('Conflit concurrent.');
  }
  private event(tx:Prisma.TransactionClient,transferId:string,actorId:string,action:string,key:string,payload?:Prisma.InputJsonValue){
    return tx.stockTransferEvent.create({data:{transferId,actorId,action,operationKey:key,...(payload?{payload}:{})}});
  }
  async create(input:CreateTransferInput){
    return this.atomic(async tx=>{
      await this.access(tx,input.originId,input.actorId);
      await this.access(tx,input.destinationId,input.actorId);
      const products=await tx.product.count({where:{id:{in:input.lines.map(l=>l.productId)},active:true}});
      if(products!==input.lines.length)throw new ConflictException('Produit inexistant ou inactif.');
      const transfer=await tx.stockTransfer.create({data:{
        number:input.number,originId:input.originId,destinationId:input.destinationId,createdById:input.actorId,
        lines:{create:input.lines.map(l=>({productId:l.productId,quantity:D(l.quantity)}))}
      },include:{lines:true}});
      await this.event(tx,transfer.id,input.actorId,'CREATED','TRANSFER_CREATE:'+transfer.id);
      return transfer;
    });
  }
  get(id:string,actorId:string){return this.atomic(tx=>this.load(tx,id,actorId));}
  async approve(id:string,actorId:string){
    return this.atomic(async tx=>{
      const transfer=await this.load(tx,id,actorId,'origin');
      if(transfer.status===TransferStatus.APPROVED)return transfer;
      if(transfer.status!==TransferStatus.DRAFT)throw new ConflictException('Transition invalide.');
      const updated=await tx.stockTransfer.update({where:{id},data:{status:TransferStatus.APPROVED,approvedAt:new Date(),approvedById:actorId}});
      await this.event(tx,id,actorId,'APPROVED','TRANSFER_APPROVE:'+id);
      return updated;
    });
  }
  async ship(id:string,actorId:string){
    return this.atomic(async tx=>{
      const transfer=await this.load(tx,id,actorId,'origin');
      if(transfer.status===TransferStatus.SHIPPED)return transfer;
      if(transfer.status!==TransferStatus.APPROVED)throw new ConflictException('Transfert non approuvé.');
      for(const line of [...transfer.lines].sort((a,b)=>a.productId.localeCompare(b.productId))){
        await tx.storeStock.upsert({where:{storeId_productId:{storeId:transfer.originId,productId:line.productId}},
          create:{storeId:transfer.originId,productId:line.productId,quantity:D('0'),reserved:D('0')},update:{}});
        // The update and reservation check are in one serializable transaction; rollback is atomic.
        const changed=await tx.storeStock.updateMany({where:{storeId:transfer.originId,productId:line.productId,quantity:{gte:line.quantity}},
          data:{quantity:{decrement:line.quantity}}});
        if(changed.count!==1)throw new ConflictException('Stock source insuffisant.');
        const current=await tx.storeStock.findUniqueOrThrow({where:{storeId_productId:{storeId:transfer.originId,productId:line.productId}}});
        if(current.quantity.lessThan(current.reserved))throw new ConflictException('Stock libre insuffisant : réservation existante.');
        await tx.stockMovement.create({data:{storeId:transfer.originId,productId:line.productId,
          quantity:line.quantity.negated(),type:MovementType.TRANSFER_OUT,referenceType:'STOCK_TRANSFER',referenceId:id,
          operationKey:'TRANSFER_OUT:'+line.id,actorId,reason:'Expédition transfert '+transfer.number}});
      }
      const updated=await tx.stockTransfer.update({where:{id},data:{status:TransferStatus.SHIPPED,shippedAt:new Date(),shippedById:actorId}});
      await this.event(tx,id,actorId,'SHIPPED','TRANSFER_SHIP:'+id);
      return updated;
    });
  }
  async receive(input:ReceiveTransferInput){
    return this.atomic(async tx=>{
      const {id,actorId,operationKey}=input;
      const transfer=await this.load(tx,id,actorId,'destination');
      const payload=JSON.stringify({lines:[...input.lines].sort((a,b)=>a.lineId.localeCompare(b.lineId)),finalize:input.finalize});
      const prior=await tx.stockTransferEvent.findUnique({where:{operationKey}});
      if(prior){
        if(prior.transferId!==id || prior.action!=='RECEIPT' || JSON.stringify(prior.payload)!==payload)
          throw new ConflictException('Clé d’idempotence réutilisée avec un contenu différent.');
        return transfer;
      }
      if(transfer.status!==TransferStatus.SHIPPED)throw new ConflictException('Réception impossible dans cet état.');
      const byId=new Map(transfer.lines.map(line=>[line.id,line]));
      for(const line of input.lines){
        const current=byId.get(line.lineId);
        if(!current)throw new ConflictException('Ligne étrangère au transfert.');
        const good=D(line.received),damaged=D(line.damaged),missing=D(line.missing);
        const total=good.plus(damaged).plus(missing);
        const remaining=current.quantity.minus(current.receivedQuantity).minus(current.damagedQuantity).minus(current.missingQuantity);
        if(total.greaterThan(remaining))throw new ConflictException('Réception supérieure au restant à traiter.');
        if(good.greaterThan(0)){
          await tx.storeStock.upsert({where:{storeId_productId:{storeId:transfer.destinationId,productId:current.productId}},
            create:{storeId:transfer.destinationId,productId:current.productId,quantity:good,reserved:D('0')},
            update:{quantity:{increment:good}}});
          await tx.stockMovement.create({data:{storeId:transfer.destinationId,productId:current.productId,
            quantity:good,type:MovementType.TRANSFER_IN,referenceType:'STOCK_TRANSFER',referenceId:id,
            operationKey:'TRANSFER_RECEIPT:'+operationKey+':'+current.id,actorId,reason:'Réception transfert '+transfer.number}});
        }
        await tx.stockTransferLine.update({where:{id:current.id},data:{
          receivedQuantity:{increment:good},damagedQuantity:{increment:damaged},missingQuantity:{increment:missing}}});
      }
      await this.event(tx,id,actorId,'RECEIPT',operationKey,JSON.parse(payload) as Prisma.InputJsonValue);
      const lines=await tx.stockTransferLine.findMany({where:{transferId:id}});
      const accounted=lines.every(l=>l.receivedQuantity.plus(l.damagedQuantity).plus(l.missingQuantity).equals(l.quantity));
      if(input.finalize && !accounted)throw new ConflictException('Toutes les quantités doivent être comptabilisées avant clôture.');
      if(accounted){
        const discrepancy=lines.some(l=>l.damagedQuantity.greaterThan(0)||l.missingQuantity.greaterThan(0));
        await tx.stockTransfer.update({where:{id},data:{status:discrepancy?TransferStatus.CLOSED_WITH_DISCREPANCY:TransferStatus.RECEIVED,
          receivedAt:new Date(),receivedById:actorId,closedAt:new Date(),closedById:actorId}});
        await this.event(tx,id,actorId,discrepancy?'CLOSED_WITH_DISCREPANCY':'RECEIVED','TRANSFER_CLOSE:'+id);
      }
      return tx.stockTransfer.findUniqueOrThrow({where:{id},include:{lines:true,events:{orderBy:{createdAt:'asc'}}}});
    });
  }
  async cancel(id:string,actorId:string){
    return this.atomic(async tx=>{
      const transfer=await this.load(tx,id,actorId,'origin');
      if(transfer.status===TransferStatus.CANCELLED)return transfer;
      if(transfer.status!==TransferStatus.DRAFT && transfer.status!==TransferStatus.APPROVED)
        throw new ConflictException('Un transfert expédié ne peut pas être annulé.');
      const updated=await tx.stockTransfer.update({where:{id},data:{status:TransferStatus.CANCELLED,cancelledAt:new Date(),cancelledById:actorId}});
      await this.event(tx,id,actorId,'CANCELLED','TRANSFER_CANCEL:'+id);
      return updated;
    });
  }
}
