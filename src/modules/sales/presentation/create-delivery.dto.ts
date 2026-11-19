import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNumberString, IsUUID, ValidateNested } from 'class-validator';

export class DeliveryLineDto {
  @IsUUID()
  storeId!: string;

  @IsUUID()
  productId!: string;

  @IsNumberString()
  quantity!: string;
}

export class CreateDeliveryDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DeliveryLineDto)
  lines!: DeliveryLineDto[];
}
