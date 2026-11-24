import { ApiProperty as SwaggerField } from '@nestjs/swagger';
import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
export class CreateProductDto {
  @ApiProperty({ example: 'PAN-550W' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @SwaggerField({ type: String, maxLength: 80 })
  sku!: string;
  @ApiProperty({ example: 'Panneau solaire 550 W' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @SwaggerField({ type: String, maxLength: 200 })
  name!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @SwaggerField({ required: false, type: String })
  description?: string;
  @ApiPropertyOptional({ example: 'PIECE' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @SwaggerField({ required: false, type: String, maxLength: 40 })
  unit?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  @SwaggerField({ required: false, type: String, format: 'uuid' })
  categoryId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  @SwaggerField({ required: false, type: String, format: 'uuid' })
  brandId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  @SwaggerField({ required: false, type: String, format: 'uuid' })
  taxRegimeId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @SwaggerField({ required: false, type: Boolean })
  isSolarPlant?: boolean;
}
export class UpdateProductDto extends PartialType(OmitType(CreateProductDto, ['sku'] as const)) {}
