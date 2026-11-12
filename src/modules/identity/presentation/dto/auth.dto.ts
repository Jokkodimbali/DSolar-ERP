import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
export class LoginDto {
  @ApiProperty({ example: 'admin@dsolar.sn' })
  @IsEmail()
  email!: string;
  @ApiProperty() @IsString() @IsNotEmpty() password!: string;
}
export class RefreshDto {
  @ApiProperty() @IsString() @MinLength(20) refreshToken!: string;
}
