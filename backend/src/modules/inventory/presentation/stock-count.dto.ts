import { ApiProperty as SwaggerField } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CountLineDto {
  @IsUUID()
  @SwaggerField({ type: String, format: 'uuid' })
  productId!: string;

  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/)
  @SwaggerField({ type: String, pattern: /^(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/.source })
  counted!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @SwaggerField({ required: false, type: String, maxLength: 500 })
  reason?: string;
}

export class RecordCountDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CountLineDto)
  @SwaggerField({ type: () => [CountLineDto], minItems: 1, maxItems: 100 })
  lines!: CountLineDto[];
}
