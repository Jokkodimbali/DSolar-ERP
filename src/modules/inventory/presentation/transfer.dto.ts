import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, IsUUID, Length, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
export class TransferLineDto {
  @IsUUID() productId!: string;
  @IsString() @Matches(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/) quantity!: string;
}
export class CreateTransferDto {
  @IsUUID() originId!: string;
  @IsUUID() destinationId!: string;
  @IsString() @Length(3,60) number!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100)
  @ValidateNested({each:true}) @Type(()=>TransferLineDto) lines!: TransferLineDto[];
}
