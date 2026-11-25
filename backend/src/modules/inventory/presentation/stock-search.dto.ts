import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PageQueryDto } from '../../../infrastructure/http/page-query.dto';

export class StockSearchDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ['ALL', 'AVAILABLE', 'RESERVED', 'EMPTY'] })
  @IsOptional()
  @IsIn(['ALL', 'AVAILABLE', 'RESERVED', 'EMPTY'])
  availability?: 'ALL' | 'AVAILABLE' | 'RESERVED' | 'EMPTY';
}
