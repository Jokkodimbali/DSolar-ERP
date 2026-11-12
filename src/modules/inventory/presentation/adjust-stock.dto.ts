import { IsIn, IsString, IsUUID, Length, Matches } from 'class-validator';
export class AdjustStockDto {
  @IsUUID() storeId!: string;
  @IsUUID() productId!: string;
  @IsIn(['IN','OUT']) direction!: 'IN' | 'OUT';
  @IsString() @Matches(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/) quantity!: string;
  @IsString() @Length(5,500) reason!: string;
  @IsUUID() operationKey!: string;
}
