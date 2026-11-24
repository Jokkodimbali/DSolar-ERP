import { ApiProperty as SwaggerField } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  IsUUID,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
export class TransferLineDto {
  @IsUUID() @SwaggerField({ type: String, format: 'uuid' }) productId!: string;
  @IsString() @Matches(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/) @SwaggerField({ type: String, pattern: /^(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/.source }) quantity!: string;
}
export class CreateTransferDto {
  @IsUUID() @SwaggerField({ type: String, format: 'uuid' }) originId!: string;
  @IsUUID() @SwaggerField({ type: String, format: 'uuid' }) destinationId!: string;
  @IsString() @Length(3, 60) @SwaggerField({ type: String, minLength: 3, maxLength: 60 }) number!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => TransferLineDto)
  @SwaggerField({ type: () => [TransferLineDto], minItems: 1, maxItems: 100 }) lines!: TransferLineDto[];
}
