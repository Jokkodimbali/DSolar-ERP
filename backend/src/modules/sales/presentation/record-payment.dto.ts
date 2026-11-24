import { ApiProperty as SwaggerField } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class RecordPaymentDto {
  @Matches(/^(?!(?:0)(?:\.0{1,2})?$)(?:0|[1-9]\d*)(?:\.\d{1,2})?$/)
  @SwaggerField({ type: String, pattern: /^(?!(?:0)(?:\.0{1,2})?$)(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.source })
  amount!: string;

  @IsEnum(PaymentMethod)
  @SwaggerField({ enum: PaymentMethod })
  method!: PaymentMethod;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @SwaggerField({ type: String, maxLength: 128, minLength: 8 })
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @SwaggerField({ required: false, type: String, maxLength: 200 })
  externalReference?: string;
}
