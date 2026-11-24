import { ApiProperty as SwaggerField } from '@nestjs/swagger';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
export class LoginDto {
  @ApiProperty({ example: 'admin@dsolar.sn' })
  @IsEmail()
  @MaxLength(254)
  @SwaggerField({ type: String, format: 'email', maxLength: 254 }) email!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(1024) @SwaggerField({ type: String, format: 'password', writeOnly: true, maxLength: 1024 }) password!: string;
}
export class RefreshDto {
  @ApiProperty() @IsString() @MinLength(20) @MaxLength(4096) @SwaggerField({ type: String, writeOnly: true, maxLength: 4096, minLength: 20 }) refreshToken!: string;
}
