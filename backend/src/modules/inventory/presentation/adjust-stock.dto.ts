import { ApiProperty as SwaggerField } from '@nestjs/swagger';
import { IsIn, IsString, IsUUID, Length, Matches } from 'class-validator';
export class AdjustStockDto {
  @IsUUID() @SwaggerField({ type: String, format: 'uuid' }) storeId!: string;
  @IsUUID() @SwaggerField({ type: String, format: 'uuid' }) productId!: string;
  @IsIn(['IN', 'OUT']) @SwaggerField({ enum: ['IN', 'OUT'] }) direction!: 'IN' | 'OUT';
  @IsString()
  @Matches(/^(?!(?:0)(?:\.0{1,3})?$)(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/)
  @SwaggerField({
    type: String,
    pattern: /^(?!(?:0)(?:\.0{1,3})?$)(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/.source,
  })
  quantity!: string;
  @IsString() @Length(5, 500) @SwaggerField({ type: String, minLength: 5, maxLength: 500 }) reason!: string;
  @IsUUID() @SwaggerField({ type: String, format: 'uuid' }) operationKey!: string;
}
