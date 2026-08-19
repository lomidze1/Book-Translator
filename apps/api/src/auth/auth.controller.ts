import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import type { Request, Response, CookieOptions } from 'express';
import { AuthService } from './auth.service';
import {
  RegisterDto, LoginDto, GoogleAuthDto,
  SendOtpDto, VerifyOtpDto, ForgotPasswordDto, ResetPasswordDto, VerifyEmailDto,
  RequestPasswordChangeDto, ConfirmPasswordChangeDto,
} from './dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';

const REFRESH_COOKIE = 'refresh_token';
const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, matches JWT TTL

@Controller('auth')
export class AuthController {
  private readonly cookieOptions: CookieOptions;

  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    this.cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      // Limit the cookie to the /auth path so it isn't sent on every request.
      path: '/api/auth',
      maxAge: REFRESH_TOKEN_MAX_AGE_MS,
    };
  }

  private setRefreshCookie(res: Response, refreshToken: string): void {
    res.cookie(REFRESH_COOKIE, refreshToken, this.cookieOptions);
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, { ...this.cookieOptions, maxAge: undefined });
  }

  /**
   * Native apps have no cookie jar, so they opt into receiving the refresh
   * token in the response body via this header. Web clients never send it and
   * keep the httpOnly-cookie-only behavior.
   */
  private isMobileClient(req: Request): boolean {
    return req.headers['x-mobile-client'] === 'true';
  }

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Throttle({ 'auth-login': { ttl: 60000, limit: process.env.NODE_ENV === 'production' ? 20 : 10000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { refreshToken, ...rest } = await this.authService.login(dto);
    this.setRefreshCookie(res, refreshToken);
    return this.isMobileClient(req) ? { ...rest, refreshToken } : rest;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieToken = req.cookies?.[REFRESH_COOKIE];
    const bodyToken =
      typeof (req.body as { refreshToken?: unknown })?.refreshToken === 'string'
        ? ((req.body as { refreshToken: string }).refreshToken)
        : undefined;
    const token = cookieToken ?? bodyToken;
    if (!token) {
      throw new UnauthorizedException('Missing refresh token');
    }
    const { accessToken, refreshToken } = await this.authService.refreshTokens(token);
    this.setRefreshCookie(res, refreshToken);
    // A body token means a cookie-less native client — hand the rotated token back.
    return cookieToken ? { accessToken } : { accessToken, refreshToken };
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) res: Response) {
    this.clearRefreshCookie(res);
    return { success: true };
  }

  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  async googleAuth(
    @Body() dto: GoogleAuthDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { refreshToken, ...rest } = await this.authService.googleAuth(dto);
    this.setRefreshCookie(res, refreshToken);
    return this.isMobileClient(req) ? { ...rest, refreshToken } : rest;
  }

  @Public()
  @Throttle({ 'auth-otp': { ttl: 60000, limit: process.env.NODE_ENV === 'production' ? 5 : 10000 } })
  @Post('phone/send-otp')
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendOtp(dto);
  }

  @Public()
  @Post('phone/verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { refreshToken, ...rest } = await this.authService.verifyOtp(dto);
    this.setRefreshCookie(res, refreshToken);
    return rest;
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Public()
  @Get('verify-email')
  async verifyEmail(@Query() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  async resendVerification(@Body() dto: ForgotPasswordDto) {
    return this.authService.resendVerificationEmail(dto.email);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: { id: string },
    @Body() dto: RequestPasswordChangeDto,
  ) {
    return this.authService.requestPasswordChange(user.id, dto.newPassword);
  }

  @Post('confirm-password-change')
  @Public()
  @HttpCode(HttpStatus.OK)
  async confirmPasswordChange(
    @Body() dto: ConfirmPasswordChangeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Confirming a password change rotates tokenVersion → invalidate cookie too.
    this.clearRefreshCookie(res);
    return this.authService.confirmPasswordChange(dto.token);
  }
}
