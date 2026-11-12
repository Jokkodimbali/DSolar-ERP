import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
export class UpdateStoreDto {
  @ApiPropertyOptional({ example: 'Magasin Dakar' })
  @IsOptional() @IsString() @MinLength(1) @MaxLength(160)
  name?: string;
  @ApiPropertyOptional({ example: 'Dakar, Sénégal', nullable: true })
  @IsOptional() @IsString()
  address?: string | null;
}
