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
  MinLength,
  ValidateNested,
} from 'class-validator';

class IssueCreditNoteCreditAllocationDto {
  @IsUUID()
  @SwaggerField({ type: String, format: 'uuid' })
  invoiceLineId!: string;
  @Matches(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/)
  @SwaggerField({ type: String, pattern: /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/.source })
  netAmount!: string;
}

export class PreviewCreditNoteDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => IssueCreditNoteCreditAllocationDto)
  @SwaggerField({ type: () => [IssueCreditNoteCreditAllocationDto], minItems: 1, maxItems: 100 })
  lines!: IssueCreditNoteCreditAllocationDto[];
}

export class IssueCreditNoteDto {
  @IsOptional()
  @IsUUID('4')
  @SwaggerField({ required: false, type: String, format: 'uuid' })
  operationKey?: string;

  @Matches(/^(?!(?:0)(?:\.0{1,2})?$)(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/)
  @SwaggerField({
    type: String,
    pattern: /^(?!(?:0)(?:\.0{1,2})?$)(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/.source,
  })
  amount!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(500)
  @SwaggerField({ type: String, maxLength: 500, minLength: 10 })
  reason!: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => IssueCreditNoteCreditAllocationDto)
  @SwaggerField({
    required: false,
    type: () => [IssueCreditNoteCreditAllocationDto],
    minItems: 1,
    maxItems: 100,
  })
  lines?: IssueCreditNoteCreditAllocationDto[];
}
