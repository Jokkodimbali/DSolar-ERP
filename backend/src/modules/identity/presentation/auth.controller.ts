import { SuccessMessage } from '../../../infrastructure/http/success-message.interceptor';
import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  browserRefreshToken,
  clearBrowserSession,
  requireBrowserRequest,
  setBrowserSession,
} from './browser-session-cookie';
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
  @Post('login') @PublicRoute() @UseGuards(LoginRateLimitGuard) @SuccessMessage('Connexion réussie.') login(
    @Body() dto: LoginDto,
  ) {
    return this.useCases.login(dto.email, dto.password);
  }
  @Post('refresh')
  @PublicRoute()
  @UseGuards(LoginRateLimitGuard)
  @SuccessMessage('Session renouvelée avec succès.')
  refresh(@Body() dto: RefreshDto) {
    return this.useCases.refresh(dto.refreshToken);
  }
  @Post('logout')
  @PublicRoute()
  @UseGuards(LoginRateLimitGuard)
  @SuccessMessage('Déconnexion effectuée.')
  logout(@Body() dto: RefreshDto) {
    return this.useCases.logout(dto.refreshToken);
  }
  @Post('browser/login')
  @PublicRoute()
  @UseGuards(LoginRateLimitGuard)
  @Header('Cache-Control', 'no-store')
  @SuccessMessage('Connexion réussie.')
  async browserLogin(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    requireBrowserRequest(request);
    const { jetonRenouvellement, ...result } = await this.useCases.login(dto.email, dto.password);
    setBrowserSession(response, jetonRenouvellement);
    return result;
  }

  @Post('browser/refresh')
  @PublicRoute()
  @UseGuards(LoginRateLimitGuard)
  @Header('Cache-Control', 'no-store')
  @SuccessMessage('Session renouvelée avec succès.')
  async browserRefresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    requireBrowserRequest(request);
    try {
      const { jetonRenouvellement, ...result } = await this.useCases.refresh(browserRefreshToken(request));
      setBrowserSession(response, jetonRenouvellement);
      return result;
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) clearBrowserSession(response);
      throw error;
    }
  }

  @Post('browser/logout')
  @PublicRoute()
  @UseGuards(LoginRateLimitGuard)
  @Header('Cache-Control', 'no-store')
  @SuccessMessage('Déconnexion effectuée.')
  async browserLogout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    requireBrowserRequest(request);
    try {
      return await this.useCases.logout(browserRefreshToken(request));
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) return { message: 'Déconnexion effectuée.' };
      throw error;
    } finally {
      clearBrowserSession(response);
    }
  }

  @Get('me')
  @AuthenticatedOnly()
  @UseGuards(AccessGuard)
  @ApiBearerAuth()
  me(@CurrentUserId() userId: string) {
    return this.useCases.me(userId);
  }
}
