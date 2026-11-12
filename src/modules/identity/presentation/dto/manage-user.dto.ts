import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsEmail, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
export class CreateUserDto {
  @ApiProperty({ example: 'vendeur@dsolar.sn' }) @IsEmail() email!: string;
  @ApiProperty({ example: 'Awa Ndiaye' }) @IsString() @MinLength(2) @MaxLength(180) fullName!: string;
  @ApiProperty({ minLength: 12 }) @IsString() @MinLength(12) password!: string;
  @ApiProperty({ type: [String], example: ['COMMERCIAL'] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  roleCodes!: string[];
  @ApiProperty({ type: [String], example: [] })
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  storeIds!: string[];
}
export class ReplaceUserAccessDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayUnique() @IsString({ each: true }) roleCodes!: string[];
  @ApiProperty({ type: [String] }) @IsArray() @ArrayUnique() @IsUUID('4', { each: true }) storeIds!: string[];
}
