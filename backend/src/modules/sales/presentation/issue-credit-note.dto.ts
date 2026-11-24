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

class CreditAllocationDto {
  @IsUUID()
  invoiceLineId!: string;
  @Matches(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/)
  netAmount!: string;
}

export class IssueCreditNoteDto {
  @Matches(/^(?!(?:0)(?:\.0{1,2})?$)(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/)
  amount!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreditAllocationDto)
  lines?: CreditAllocationDto[];
}
