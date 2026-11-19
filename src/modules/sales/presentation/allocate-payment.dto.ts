import { IsUUID, Matches } from 'class-validator';

export class AllocatePaymentDto {
  @IsUUID()
  invoiceId!: string;

  @Matches(/^(?!(?:0)(?:\.0{1,2})?$)(?:0|[1-9]\d*)(?:\.\d{1,2})?$/)
  amount!: string;
}
