import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Santé')
@Controller('health')
export class HealthController {
  @Get()
  check(): { statut: string; application: string } {
    return { statut: 'opérationnel', application: 'DSolar ERP' };
  }
}
