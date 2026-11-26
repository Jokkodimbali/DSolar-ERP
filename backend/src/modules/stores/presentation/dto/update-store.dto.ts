import { ApiProperty as SwaggerField } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
export class UpdateStoreDto {
  @ApiPropertyOptional({ example: 'Magasin Dakar' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  @SwaggerField({ required: false, type: String, maxLength: 160, minLength: 1 })
  name?: string;
  @ApiPropertyOptional({ example: 'Dakar, Sénégal', nullable: true })
  @IsOptional()
  @IsString()
  @SwaggerField({ required: false, type: String })
  address?: string | null;
}
