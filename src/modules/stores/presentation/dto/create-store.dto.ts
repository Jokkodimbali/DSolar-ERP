import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateStoreDto {
  @ApiProperty({ example: 'MAG-001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  code!: string;

  @ApiProperty({ example: 'Magasin principal' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ example: 'Passy, Sénégal' })
  @IsOptional()
  @IsString()
  address?: string;
}
