import { Controller, Get } from '@nestjs/common';
import { PublicRoute } from './modules/identity/presentation/route-policy';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Santé')
@Controller('health')
export class HealthController {
  @Get()
  @PublicRoute()
  check(): { statut: string; application: string } {
    return { statut: 'opérationnel', application: 'DSolar ERP' };
  }
}
