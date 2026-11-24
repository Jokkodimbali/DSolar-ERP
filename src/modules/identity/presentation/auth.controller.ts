import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUseCases } from '../application/auth.use-cases';
import { AccessGuard } from './access.guard';
import { LoginRateLimitGuard } from './login-rate-limit.guard';
import { CurrentUserId } from './current-user.decorator';
import { AuthenticatedOnly, PublicRoute } from './route-policy';
import { LoginDto, RefreshDto } from './dto/auth.dto';

@ApiTags('Authentification')
@Controller('auth')
export class AuthController {
  constructor(private readonly useCases: AuthUseCases) {}
  @Post('login') @PublicRoute() @UseGuards(LoginRateLimitGuard) login(@Body() dto: LoginDto) {
    return this.useCases.login(dto.email, dto.password);
  }
  @Post('refresh') @PublicRoute() @UseGuards(LoginRateLimitGuard) refresh(@Body() dto: RefreshDto) {
    return this.useCases.refresh(dto.refreshToken);
  }
  @Post('logout') @PublicRoute() @UseGuards(LoginRateLimitGuard) logout(@Body() dto: RefreshDto) {
    return this.useCases.logout(dto.refreshToken);
  }
  @Get('me')
  @AuthenticatedOnly()
  @UseGuards(AccessGuard)
  @ApiBearerAuth()
  me(@CurrentUserId() userId: string) {
    return this.useCases.me(userId);
  }
}
