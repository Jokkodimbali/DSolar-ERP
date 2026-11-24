import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
export class CreateCategoryDto {
  @ApiProperty({ example: 'PANNEAUX' }) @IsString() @MaxLength(60) code!: string;
  @ApiProperty({ example: 'Panneaux solaires' }) @IsString() @MaxLength(200) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() parentId?: string;
}
export class CreateBrandDto {
  @ApiProperty({ example: 'Deye' }) @IsString() @MaxLength(200) name!: string;
}
export class CreateTaxRegimeDto {
  @ApiProperty({ example: 'TVA18' }) @IsString() @MaxLength(60) code!: string;
  @ApiProperty({ example: 'TVA standard' }) @IsString() @MaxLength(200) name!: string;
  @ApiProperty({ example: '18.0000', description: 'Taux en pourcentage, à valider fiscalement.' })
  @IsString()
  @Matches(/^(0|[1-9]\d{0,2})(\.\d{1,4})?$/)
  rate!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() legalBasis?: string;
}
export class SetProductPriceDto {
  @ApiProperty({ example: '150000.00' })
  @IsString()
  @Matches(/^(0|[1-9]\d{0,14})(\.\d{1,2})?$/)
  salePrice!: string;
  @ApiPropertyOptional({ example: '125000.00' })
  @IsOptional()
  @IsString()
  @Matches(/^(0|[1-9]\d{0,14})(\.\d{1,2})?$/)
  purchasePrice?: string;
}
