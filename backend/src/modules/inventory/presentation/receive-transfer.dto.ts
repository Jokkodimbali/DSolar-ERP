import { ApiProperty as SwaggerField } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
export class ReceiveTransferLineDto {
  @IsUUID() @SwaggerField({ type: String, format: 'uuid' }) lineId!: string;
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/)
  @SwaggerField({ type: String, pattern: /^(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/.source })
  received!: string;
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/)
  @SwaggerField({ type: String, pattern: /^(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/.source })
  damaged!: string;
  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/)
  @SwaggerField({ type: String, pattern: /^(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/.source })
  missing!: string;
}
export class ReceiveTransferDto {
  @IsUUID() @SwaggerField({ type: String, format: 'uuid' }) operationKey!: string;
  @IsBoolean() @SwaggerField({ type: Boolean }) finalize!: boolean;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReceiveTransferLineDto)
  @SwaggerField({ type: () => [ReceiveTransferLineDto], minItems: 1, maxItems: 100 })
  lines!: ReceiveTransferLineDto[];
}
