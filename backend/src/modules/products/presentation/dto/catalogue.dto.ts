import { ApiProperty as SwaggerField } from '@nestjs/swagger';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
export class CreateCategoryDto {
  @ApiProperty({ example: 'PANNEAUX' })
  @IsString()
  @MaxLength(60)
  @SwaggerField({ type: String, maxLength: 60 })
  code!: string;
  @ApiProperty({ example: 'Panneaux solaires' })
  @IsString()
  @MaxLength(200)
  @SwaggerField({ type: String, maxLength: 200 })
  name!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  @SwaggerField({ required: false, type: String, format: 'uuid' })
  parentId?: string;
}
export class CreateBrandDto {
  @ApiProperty({ example: 'Deye' })
  @IsString()
  @MaxLength(200)
  @SwaggerField({ type: String, maxLength: 200 })
  name!: string;
}
export class CreateTaxRegimeDto {
  @ApiProperty({ example: 'TVA18' })
  @IsString()
  @MaxLength(60)
  @SwaggerField({ type: String, maxLength: 60 })
  code!: string;
  @ApiProperty({ example: 'TVA standard' })
  @IsString()
  @MaxLength(200)
  @SwaggerField({ type: String, maxLength: 200 })
  name!: string;
  @ApiProperty({ example: '18.0000', description: 'Taux en pourcentage, à valider fiscalement.' })
  @IsString()
  @Matches(/^(0|[1-9]\d{0,2})(\.\d{1,4})?$/)
  @SwaggerField({ type: String, pattern: /^(0|[1-9]\d{0,2})(\.\d{1,4})?$/.source })
  rate!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @SwaggerField({ required: false, type: String })
  legalBasis?: string;
}
export class SetProductPriceDto {
  @ApiProperty({ example: '150000.00' })
  @IsString()
  @Matches(/^(0|[1-9]\d{0,14})(\.\d{1,2})?$/)
  @SwaggerField({ type: String, pattern: /^(0|[1-9]\d{0,14})(\.\d{1,2})?$/.source })
  salePrice!: string;
  @ApiPropertyOptional({ example: '125000.00' })
  @IsOptional()
  @IsString()
  @Matches(/^(0|[1-9]\d{0,14})(\.\d{1,2})?$/)
  @SwaggerField({ required: false, type: String, pattern: /^(0|[1-9]\d{0,14})(\.\d{1,2})?$/.source })
  purchasePrice?: string;
}

export class RenameReferenceDto {
  @ApiProperty({ example: 'Nouvelle désignation' })
  @IsString()
  @MaxLength(200)
  @SwaggerField({ type: String, maxLength: 200 })
  name!: string;
}
