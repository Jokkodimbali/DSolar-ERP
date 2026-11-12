import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
export class CreateProductDto {
 @ApiProperty({example:'PAN-550W'}) @IsString() @IsNotEmpty() @MaxLength(80) sku!:string;
 @ApiProperty({example:'Panneau solaire 550 W'}) @IsString() @IsNotEmpty() @MaxLength(200) name!:string;
 @ApiPropertyOptional() @IsOptional() @IsString() description?:string;
 @ApiPropertyOptional({example:'PIECE'}) @IsOptional() @IsString() @MaxLength(40) unit?:string;
 @ApiPropertyOptional() @IsOptional() @IsUUID() categoryId?:string;
 @ApiPropertyOptional() @IsOptional() @IsUUID() brandId?:string;
 @ApiPropertyOptional() @IsOptional() @IsUUID() taxRegimeId?:string;
 @ApiPropertyOptional() @IsOptional() @IsBoolean() isSolarPlant?:boolean;
}
export class UpdateProductDto extends PartialType(OmitType(CreateProductDto, ['sku'] as const)) {}
