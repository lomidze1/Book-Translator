import { Injectable, ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
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

// Password reset constants
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const FORGOT_PASSWORD_RATE_LIMIT_SECONDS = 900; // 15 minutes
const FORGOT_PASSWORD_MAX_REQUESTS = 3;

@Injectable()
export class AuthService {
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
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
      },
    });

    // Send verification email
    try {
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(verificationToken).digest('hex');

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerificationToken: hashedToken,
          emailVerificationExpires: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
        },
      });

      await this.emailService.sendEmailVerification(dto.email, verificationToken, dto.name);
    } catch {
      // Email sending failure should not block registration
    }

    return {
      message: 'Verification email sent',
      userId: user.id,
    };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.generateTokens(user.id, user.email!);

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
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      return this.generateTokens(user.id, user.email);
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

    // Find or create user
    let user = await this.prisma.user.findUnique({
      where: { email: googlePayload.email },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: googlePayload.email,
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
        await this.prisma.account.create({
          data: {
            userId: user.id,
            provider: 'google',
            providerAccountId: googlePayload.sub,
          },
        });
      }
    }

    const tokens = await this.generateTokens(user.id, user.email);

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
    // Rate limiting — 1 request per minute per phone
    const rateLimitKey = `otp:rate:${dto.phone}`;
    const recentRequest = await this.redis.get(rateLimitKey);
    if (recentRequest) {
      throw new BadRequestException('Please wait before requesting a new OTP');
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP in Redis with 5 minute TTL
    const otpKey = `otp:${dto.phone}`;
    await this.redis.set(otpKey, otp, OTP_TTL_SECONDS);

    // Reset attempt counter
    const attemptKey = `otp:attempts:${dto.phone}`;
    await this.redis.set(attemptKey, '0', OTP_TTL_SECONDS);

    // Set rate limit
    await this.redis.set(rateLimitKey, '1', OTP_RATE_LIMIT_SECONDS);

    // TODO: Send SMS via Twilio/MessageBird
    // For development, log the OTP
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[DEV] OTP for ${dto.phone}: ${otp}`);
    }

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

    const tokens = await this.generateTokens(user.id, user.email);

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
    // Rate limiting
    const rateLimitKey = `password-reset:rate:${email.toLowerCase()}`;
    const rateLimitCount = await this.redis.incr(rateLimitKey);
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

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

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
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

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
      },
    });

    return { message: 'Password updated successfully' };
  }

  // ========================
  // Email Verification
  // ========================

  async verifyEmail(token: string): Promise<{ message: string }> {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

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
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      return { message: 'Verification email sent' };
    }

    if (user.emailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(verificationToken).digest('hex');

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

  private async generateTokens(userId: string, email: string | null): Promise<AuthTokens> {
    const payload = { sub: userId, email };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: '30d',
      }),
    ]);

    return { accessToken, refreshToken };
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
    // Check attempt limit
    const attemptKey = `otp:attempts:${phone}`;
    const attempts = await this.redis.incr(attemptKey);
    if (attempts > OTP_MAX_ATTEMPTS) {
      // Too many attempts — delete OTP
      await this.redis.del(`otp:${phone}`);
      await this.redis.del(attemptKey);
      throw new BadRequestException('Too many attempts. Please request a new OTP.');
    }

    // Get stored OTP
    const otpKey = `otp:${phone}`;
    const storedOtp = await this.redis.get(otpKey);

    if (!storedOtp) {
      return false; // Expired or never sent
    }

    return storedOtp === code;
  }
}
