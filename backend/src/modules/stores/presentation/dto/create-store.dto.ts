import { ApiProperty as SwaggerField } from '@nestjs/swagger';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateStoreDto {
  @ApiProperty({ example: 'MAG-001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  @SwaggerField({ type: String, maxLength: 30 }) code!: string;

  @ApiProperty({ example: 'Magasin principal' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  @SwaggerField({ type: String, maxLength: 160 }) name!: string;

  @ApiPropertyOptional({ example: 'Passy, Sénégal' })
  @IsOptional()
  @IsString()
  @SwaggerField({ required: false, type: String }) address?: string;
}
