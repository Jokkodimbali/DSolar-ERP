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
  productId!: string;

  @IsString()
  @Matches(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/)
  counted!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class RecordCountDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CountLineDto)
  lines!: CountLineDto[];
}
