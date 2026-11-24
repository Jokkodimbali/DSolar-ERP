import { ApiProperty as SwaggerField } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, Matches, IsUUID, ValidateNested } from 'class-validator';

export class DeliveryLineDto {
  @IsUUID()
  @SwaggerField({ type: String, format: 'uuid' }) storeId!: string;

  @IsUUID()
  @SwaggerField({ type: String, format: 'uuid' }) productId!: string;

  @Matches(/^(?!(?:0)(?:\.0{1,3})?$)(?:0|[1-9]\d*)(?:\.\d{1,3})?$/, {
    message: 'La quantité doit être un nombre positif avec au plus trois décimales.',
  })
  @SwaggerField({ type: String, pattern: /^(?!(?:0)(?:\.0{1,3})?$)(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.source }) quantity!: string;
}

export class CreateDeliveryDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DeliveryLineDto)
  @SwaggerField({ type: () => [DeliveryLineDto], minItems: 1 }) lines!: DeliveryLineDto[];
}
