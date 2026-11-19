import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class IssueCreditNoteDto {
  @Matches(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/)
  amount!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}
