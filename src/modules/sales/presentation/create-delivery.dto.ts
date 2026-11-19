import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, Matches, IsUUID, ValidateNested } from 'class-validator';

export class DeliveryLineDto {
  @IsUUID()
  storeId!: string;

  @IsUUID()
  productId!: string;

  @Matches(/^(?:0|[1-9]\\d*)(?:\\.\\d{1,3})?$/, {
    message: 'La quantité doit être un nombre positif avec au plus trois décimales.',
  })
  quantity!: string;
}

export class CreateDeliveryDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DeliveryLineDto)
  lines!: DeliveryLineDto[];
}
