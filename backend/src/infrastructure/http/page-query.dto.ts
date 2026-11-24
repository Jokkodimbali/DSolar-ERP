import { ApiProperty as SwaggerField } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  @SwaggerField({ required: false, type: 'integer', minimum: 1, maximum: 100000 })
  page?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @SwaggerField({ required: false, type: 'integer', minimum: 1, maximum: 100 })
  limit?: number;
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @SwaggerField({ required: false, type: String, maxLength: 120 })
  search?: string;
}

export interface PageResult<T> {
  items: T[];
  pagination: { page: number; limit: number; total: number; pages: number };
}
