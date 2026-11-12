import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductRepository } from './product.repository';
const mock=():jest.Mocked<ProductRepository>=>({list:jest.fn(),findById:jest.fn(),findBySku:jest.fn(),create:jest.fn(),update:jest.fn(),setActive:jest.fn()});
describe('ProductsService',()=>{
 it('normalise le SKU et le nom',async()=>{const repo=mock();repo.findBySku.mockResolvedValue(null);repo.create.mockImplementation(async x=>({...x,id:'id',description:null,active:true,categoryId:null,brandId:null,taxRegimeId:null,isSolarPlant:false,unit:x.unit??'PIECE'}));const svc=new ProductsService(repo);await svc.create({sku:' pan-550 ',name:' Panneau ',unit:'piece'});expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({sku:'PAN-550',name:'Panneau',unit:'PIECE'}));});
 it('refuse un SKU déjà utilisé',async()=>{const repo=mock();repo.findBySku.mockResolvedValue({id:'id',sku:'PAN-550',name:'x',description:null,unit:'PIECE',active:true,categoryId:null,brandId:null,taxRegimeId:null,isSolarPlant:false});await expect(new ProductsService(repo).create({sku:'PAN-550',name:'Panneau'})).rejects.toThrow(ConflictException);});
 it('refuse un produit inexistant',async()=>{const repo=mock();repo.findById.mockResolvedValue(null);await expect(new ProductsService(repo).get('id')).rejects.toThrow(NotFoundException);});
});
