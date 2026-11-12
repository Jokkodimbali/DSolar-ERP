import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUseCases } from '../application/auth.use-cases';
import { AccessGuard } from './access.guard';
import { CurrentUserId } from './current-user.decorator';
import { LoginDto, RefreshDto } from './dto/auth.dto';

@ApiTags('Authentification')
@Controller('auth')
export class AuthController {
  constructor(private readonly useCases: AuthUseCases) {}
  @Post('login') login(@Body() dto: LoginDto) {
    return this.useCases.login(dto.email, dto.password);
  }
  @Post('refresh') refresh(@Body() dto: RefreshDto) {
    return this.useCases.refresh(dto.refreshToken);
  }
  @Post('logout') logout(@Body() dto: RefreshDto) {
    return this.useCases.logout(dto.refreshToken);
  }
  @Get('me')
  @UseGuards(AccessGuard)
  @ApiBearerAuth()
  me(@CurrentUserId() userId: string) {
    return this.useCases.me(userId);
  }
}
