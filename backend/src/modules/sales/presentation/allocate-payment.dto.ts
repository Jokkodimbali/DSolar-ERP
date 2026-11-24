import { ApiProperty as SwaggerField } from '@nestjs/swagger';
import { IsUUID, Matches } from 'class-validator';

export class AllocatePaymentDto {
  @IsUUID()
  @SwaggerField({ type: String, format: 'uuid' })
  invoiceId!: string;

  @Matches(/^(?!(?:0)(?:\.0{1,2})?$)(?:0|[1-9]\d*)(?:\.\d{1,2})?$/)
  @SwaggerField({ type: String, pattern: /^(?!(?:0)(?:\.0{1,2})?$)(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.source })
  amount!: string;
}
