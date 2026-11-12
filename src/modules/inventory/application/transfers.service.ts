import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { CreateTransferInput, ReceiveTransferInput, TRANSFER_REPOSITORY, TransferRepository } from './transfers.port';
const quantityPattern = /^(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/;
@Injectable()
export class TransfersService {
  constructor(@Inject(TRANSFER_REPOSITORY) private readonly repository: TransferRepository) {}
  create(input: CreateTransferInput) {
    if (input.originId === input.destinationId) throw new BadRequestException('Les magasins doivent être différents.');
    if (!input.lines.length || input.lines.length > 100) throw new BadRequestException('Entre 1 et 100 lignes sont requises.');
    const ids = new Set<string>();
    for (const line of input.lines) {
      if (ids.has(line.productId)) throw new BadRequestException('Un produit ne peut apparaître deux fois.');
      ids.add(line.productId);
      if (!quantityPattern.test(line.quantity) || Number(line.quantity) <= 0)
        throw new BadRequestException('La quantité doit être positive (trois décimales maximum).');
    }
    return this.repository.create({...input,number:input.number.trim()});
  }
  receive(input: ReceiveTransferInput) {
    if (!input.lines.length || input.lines.length > 100) throw new BadRequestException('Une à cent lignes requises.');
    const ids=new Set<string>();
    for(const line of input.lines){
      if(ids.has(line.lineId)) throw new BadRequestException('Ligne de réception en double.');
      ids.add(line.lineId);
      for(const value of [line.received,line.damaged,line.missing])
        if(!quantityPattern.test(value)) throw new BadRequestException('Quantité invalide.');
      if([line.received,line.damaged,line.missing].every(x=>Number(x)===0))
        throw new BadRequestException('Une ligne doit déclarer une quantité non nulle.');
    }
    return this.repository.receive(input);
  }
  get(id:string,actorId:string){return this.repository.get(id,actorId);}
  approve(id:string,actorId:string){return this.repository.approve(id,actorId);}
  ship(id:string,actorId:string){return this.repository.ship(id,actorId);}
  cancel(id:string,actorId:string){return this.repository.cancel(id,actorId);}
}
