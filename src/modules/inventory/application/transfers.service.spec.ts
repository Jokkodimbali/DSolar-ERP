import { BadRequestException } from '@nestjs/common';
import { TransfersService } from './transfers.service';
import { TransferRepository } from './transfers.port';
describe('TransfersService',()=>{
  const repo={create:jest.fn(),receive:jest.fn()} as unknown as TransferRepository;
  const service=new TransfersService(repo);
  const valid={originId:'a',destinationId:'b',actorId:'u',number:'TR-001',lines:[{productId:'p',quantity:'2.500'}]};
  const receipt={id:'t',actorId:'u',operationKey:'key',finalize:false,
    lines:[{lineId:'l',received:'1.000',damaged:'0',missing:'0'}]};
  it('refuse les magasins identiques',()=>expect(()=>service.create({...valid,destinationId:'a'})).toThrow(BadRequestException));
  it('refuse les produits dupliqués',()=>expect(()=>service.create({...valid,lines:[valid.lines[0],valid.lines[0]]})).toThrow(BadRequestException));
  it('refuse les quantités nulles',()=>expect(()=>service.create({...valid,lines:[{productId:'p',quantity:'0'}]})).toThrow(BadRequestException));
  it('accepte les données valides',async()=>{await service.create(valid);expect(repo.create).toHaveBeenCalledWith(valid);});
  it('refuse les doublons de lignes reçues',()=>expect(()=>service.receive({...receipt,lines:[receipt.lines[0],receipt.lines[0]]})).toThrow(BadRequestException));
  it('refuse une réception entièrement nulle',()=>expect(()=>service.receive({...receipt,lines:[{lineId:'l',received:'0',damaged:'0',missing:'0'}]})).toThrow(BadRequestException));
  it('refuse les décimales excessives',()=>expect(()=>service.receive({...receipt,lines:[{lineId:'l',received:'1.0001',damaged:'0',missing:'0'}]})).toThrow(BadRequestException));
  it('accepte une réception partielle',async()=>{await service.receive(receipt);expect(repo.receive).toHaveBeenCalledWith(receipt);});
});
