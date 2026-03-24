import { Injectable, ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
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

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly redis: RedisService,
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

    // TODO: Send verification email

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
