import { ApiProperty as SwaggerField } from '@nestjs/swagger';
import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsEmail, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
export class CreateUserDto {
  @ApiProperty({ example: 'vendeur@dsolar.sn' }) @IsEmail() @SwaggerField({ type: String, format: 'email' }) email!: string;
  @ApiProperty({ example: 'Awa Ndiaye' }) @IsString() @MinLength(2) @MaxLength(180) @SwaggerField({ type: String, maxLength: 180, minLength: 2 }) fullName!: string;
  @ApiProperty({ minLength: 12 }) @IsString() @MinLength(12) @SwaggerField({ type: String, format: 'password', writeOnly: true, minLength: 12 }) password!: string;
  @ApiProperty({ type: [String], example: ['MAGASINIER'] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @SwaggerField({ type: [String], uniqueItems: true }) roleCodes!: string[];
  @ApiProperty({ type: [String], example: [] })
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  @SwaggerField({ type: [String], uniqueItems: true }) storeIds!: string[];
}
export class ReplaceUserAccessDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayUnique() @IsString({ each: true }) @SwaggerField({ type: [String], uniqueItems: true }) roleCodes!: string[];
  @ApiProperty({ type: [String] }) @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) @SwaggerField({ type: [String], uniqueItems: true }) storeIds!: string[];
}
