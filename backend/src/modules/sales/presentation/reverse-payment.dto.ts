import { ApiProperty as SwaggerField } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ReversePaymentDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  @SwaggerField({ type: String, maxLength: 500, minLength: 10 }) reason!: string;
}
