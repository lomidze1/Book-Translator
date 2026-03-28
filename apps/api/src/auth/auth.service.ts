import { Injectable, ConflictException, UnauthorizedException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EmailService } from '../email/email.service';
import { RegisterDto, LoginDto, GoogleAuthDto, SendOtpDto, VerifyOtpDto } from './dto';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string | null;
    name: string | null;
    avatar: string | null;
  };
}

// OTP constants
const OTP_TTL_SECONDS = 300; // 5 minutes
const OTP_MAX_ATTEMPTS = 5;
const OTP_RATE_LIMIT_SECONDS = 60; // 1 request per minute per phone

// Login brute-force protection
const LOGIN_RATE_LIMIT_SECONDS = 900; // 15 minutes
const LOGIN_MAX_ATTEMPTS = 10;

// Password reset constants
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const FORGOT_PASSWORD_RATE_LIMIT_SECONDS = 900; // 15 minutes
const FORGOT_PASSWORD_MAX_REQUESTS = 3;

// Email verification resend rate limiting
const RESEND_VERIFICATION_RATE_LIMIT_SECONDS = 900; // 15 minutes
const RESEND_VERIFICATION_MAX_REQUESTS = 3;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private googleClient: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly redis: RedisService,
    private readonly emailService: EmailService,
  ) {
    this.googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }

  // ========================
  // Email + Password Auth
  // ========================

  async register(dto: RegisterDto): Promise<{ message: string; userId: string }> {
    const email = dto.email.toLowerCase();
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('EMAIL_ALREADY_EXISTS');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        name: dto.name,
      },
    });

    // Send verification email
    try {
      const { token: verificationToken, hashedToken } = this.generateHashedToken();

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerificationToken: hashedToken,
          emailVerificationExpires: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
        },
      });

      await this.emailService.sendEmailVerification(email, verificationToken, dto.name);
    } catch (error) {
      // Email failure should not block registration, but log the issue
      this.logger.error(`Failed to send verification email: ${error instanceof Error ? error.message : error}`);
    }

    return {
      message: 'Verification email sent',
      userId: user.id,
    };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const email = dto.email.toLowerCase();

    // Brute-force protection (fail-closed: blocks login if Redis is down)
    const rateLimitKey = `login:attempts:${email}`;
    const attempts = await this.redis.secureIncr(rateLimitKey);
    if (attempts === 1) {
      await this.redis.expire(rateLimitKey, LOGIN_RATE_LIMIT_SECONDS);
    }
    if (attempts > LOGIN_MAX_ATTEMPTS) {
      throw new BadRequestException('Too many login attempts. Please try again later.');
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.passwordHash) {
      // Constant-time: always run bcrypt to prevent timing-based email enumeration
      await bcrypt.compare(dto.password, '$2b$12$invalidhashfortimingattak.padding');
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Block login if email is not verified
    if (!user.emailVerified) {
      throw new ForbiddenException('EMAIL_NOT_VERIFIED');
    }

    // Reset attempts on successful login
    await this.redis.del(rateLimitKey);

    const tokens = await this.generateTokens(user.id, user.email!, user.tokenVersion);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      },
    };
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    const refreshSecret = process.env.JWT_REFRESH_SECRET;
    if (!refreshSecret) {
      throw new UnauthorizedException('Server configuration error');
    }
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: refreshSecret,
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Verify token version — rejects tokens issued before password change or logout-all
      if (payload.tokenVersion !== undefined && payload.tokenVersion !== user.tokenVersion) {
        throw new UnauthorizedException('Token has been revoked');
      }

      return this.generateTokens(user.id, user.email, user.tokenVersion);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  // ========================
  // Google OAuth
  // ========================

  async googleAuth(dto: GoogleAuthDto): Promise<AuthResponse> {
    const googlePayload = await this.verifyGoogleToken(dto.idToken);
    if (!googlePayload || !googlePayload.email) {
      throw new UnauthorizedException('Invalid Google token');
    }

    const email = googlePayload.email.toLowerCase();

    // Find or create user
    let user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email,
          emailVerified: new Date(),
          name: googlePayload.name,
          avatar: googlePayload.picture,
          accounts: {
            create: {
              provider: 'google',
              providerAccountId: googlePayload.sub,
            },
          },
        },
      });
    } else {
      // Link Google account if not linked
      const existingAccount = await this.prisma.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: 'google',
            providerAccountId: googlePayload.sub,
          },
        },
      });

      if (!existingAccount) {
        // Only link Google account if email is verified (prevent account takeover)
        if (!user.emailVerified) {
          throw new UnauthorizedException('Please verify your email before linking a Google account');
        }
        await this.prisma.account.create({
          data: {
            userId: user.id,
            provider: 'google',
            providerAccountId: googlePayload.sub,
          },
        });
      }
    }

    const tokens = await this.generateTokens(user.id, user.email, user.tokenVersion);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      },
    };
  }

  // ========================
  // Phone + OTP Auth
  // ========================

  async sendOtp(dto: SendOtpDto): Promise<{ message: string }> {
    // Rate limiting — 1 request per minute per phone (fail-closed)
    const rateLimitKey = `otp:rate:${dto.phone}`;
    const recentRequest = await this.redis.secureGet(rateLimitKey);
    if (recentRequest) {
      throw new BadRequestException('Please wait before requesting a new OTP');
    }

    // Generate 6-digit OTP (cryptographically secure)
    const otp = crypto.randomInt(100000, 1000000).toString();

    // Store OTP in Redis with 5 minute TTL (fail-closed)
    const otpKey = `otp:${dto.phone}`;
    await this.redis.secureSet(otpKey, otp, OTP_TTL_SECONDS);

    // Reset attempt counter
    const attemptKey = `otp:attempts:${dto.phone}`;
    await this.redis.secureSet(attemptKey, '0', OTP_TTL_SECONDS);

    // Set rate limit
    await this.redis.secureSet(rateLimitKey, '1', OTP_RATE_LIMIT_SECONDS);

    // TODO: Send SMS via Twilio/MessageBird
    // OTP is never logged — it is only sent via SMS

    return { message: 'OTP sent successfully' };
  }

  async verifyOtp(dto: VerifyOtpDto): Promise<AuthResponse> {
    const isValid = await this.validateOtp(dto.phone, dto.code);
    if (!isValid) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    // Clean up OTP keys
    await this.redis.del(`otp:${dto.phone}`);
    await this.redis.del(`otp:attempts:${dto.phone}`);

    // Find or create user by phone
    let user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          phone: dto.phone,
          phoneVerified: true,
        },
      });
    } else {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { phoneVerified: true },
      });
    }

    const tokens = await this.generateTokens(user.id, user.email, user.tokenVersion);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
      },
    };
  }

  // ========================
  // Password Reset
  // ========================

  async forgotPassword(email: string): Promise<{ message: string }> {
    // Rate limiting (fail-closed: blocks if Redis is down)
    const rateLimitKey = `password-reset:rate:${email.toLowerCase()}`;
    const rateLimitCount = await this.redis.secureIncr(rateLimitKey);
    if (rateLimitCount === 1) {
      await this.redis.expire(rateLimitKey, FORGOT_PASSWORD_RATE_LIMIT_SECONDS);
    }
    if (rateLimitCount > FORGOT_PASSWORD_MAX_REQUESTS) {
      throw new BadRequestException('Too many requests. Please try again later.');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Always return success to not reveal if email exists
    if (!user) {
      return { message: 'Reset link sent to email' };
    }

    // Don't allow reset for OAuth-only users (no password)
    if (!user.passwordHash) {
      return { message: 'Reset link sent to email' };
    }

    const { token: resetToken, hashedToken } = this.generateHashedToken();

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: hashedToken,
        passwordResetExpires: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });

    await this.emailService.sendPasswordResetEmail(user.email!, resetToken, user.name ?? undefined);

    return { message: 'Reset link sent to email' };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const hashedToken = this.hashToken(token);

    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: hashedToken,
        passwordResetExpires: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null,
        tokenVersion: { increment: 1 },
        // Password reset via email proves email ownership
        ...(!user.emailVerified && { emailVerified: new Date() }),
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
    });

    return { message: 'Password updated successfully' };
  }

  // ========================
  // Email Verification
  // ========================

  async verifyEmail(token: string): Promise<{ message: string }> {
    const hashedToken = this.hashToken(token);

    const user = await this.prisma.user.findFirst({
      where: {
        emailVerificationToken: hashedToken,
        emailVerificationExpires: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    if (user.emailVerified) {
      return { message: 'Email already verified' };
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: new Date(),
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
    });

    return { message: 'Email verified successfully' };
  }

  async resendVerificationEmail(email: string): Promise<{ message: string }> {
    // Rate limiting (fail-closed: blocks if Redis is down)
    const rateLimitKey = `resend-verification:rate:${email.toLowerCase()}`;
    const rateLimitCount = await this.redis.secureIncr(rateLimitKey);
    if (rateLimitCount === 1) {
      await this.redis.expire(rateLimitKey, RESEND_VERIFICATION_RATE_LIMIT_SECONDS);
    }
    if (rateLimitCount > RESEND_VERIFICATION_MAX_REQUESTS) {
      throw new BadRequestException('Too many requests. Please try again later.');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      return { message: 'Verification email sent' };
    }

    if (user.emailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    const { token: verificationToken, hashedToken } = this.generateHashedToken();

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: hashedToken,
        emailVerificationExpires: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
      },
    });

    await this.emailService.sendEmailVerification(user.email!, verificationToken, user.name ?? undefined);

    return { message: 'Verification email sent' };
  }

  // ========================
  // Private Helpers
  // ========================

  private async generateTokens(userId: string, email: string | null, tokenVersion = 0): Promise<AuthTokens> {
    const accessSecret = process.env.JWT_ACCESS_SECRET;
    const refreshSecret = process.env.JWT_REFRESH_SECRET;
    if (!accessSecret || !refreshSecret) {
      throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET environment variables are required');
    }

    const payload = { sub: userId, email, tokenVersion };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessSecret,
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: refreshSecret,
        expiresIn: '7d',
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private generateHashedToken(): { token: string; hashedToken: string } {
    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    return { token, hashedToken };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async verifyGoogleToken(idToken: string): Promise<{
    email: string;
    name?: string;
    picture?: string;
    sub: string;
  } | null> {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.email || !payload.sub) {
        return null;
      }

      return {
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
        sub: payload.sub,
      };
    } catch {
      return null;
    }
  }

  private async validateOtp(phone: string, code: string): Promise<boolean> {
    // Check attempt limit (fail-closed)
    const attemptKey = `otp:attempts:${phone}`;
    const attempts = await this.redis.secureIncr(attemptKey);
    if (attempts > OTP_MAX_ATTEMPTS) {
      // Too many attempts — delete OTP
      await this.redis.del(`otp:${phone}`);
      await this.redis.del(attemptKey);
      throw new BadRequestException('Too many attempts. Please request a new OTP.');
    }

    // Get stored OTP (fail-closed)
    const otpKey = `otp:${phone}`;
    const storedOtp = await this.redis.secureGet(otpKey);

    if (!storedOtp) {
      return false; // Expired or never sent
    }

    // Timing-safe comparison to prevent timing attacks
    if (storedOtp.length !== code.length) return false;
    return crypto.timingSafeEqual(Buffer.from(storedOtp), Buffer.from(code));
  }
}
