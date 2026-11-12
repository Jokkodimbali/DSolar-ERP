import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsString, IsUUID, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
export class ReceiveTransferLineDto {
  @IsUUID() lineId!:string;
  @IsString() @Matches(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/) received!:string;
  @IsString() @Matches(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/) damaged!:string;
  @IsString() @Matches(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/) missing!:string;
}
export class ReceiveTransferDto {
  @IsUUID() operationKey!:string;
  @IsBoolean() finalize!:boolean;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100)
  @ValidateNested({each:true}) @Type(()=>ReceiveTransferLineDto) lines!:ReceiveTransferLineDto[];
}
