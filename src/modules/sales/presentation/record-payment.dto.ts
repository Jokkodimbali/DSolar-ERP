import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class RecordPaymentDto {
  @Matches(/^(?:0|[1-9]\\d*)(?:\\.\\d{1,2})?$/)
  amount!: string;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalReference?: string;
}
