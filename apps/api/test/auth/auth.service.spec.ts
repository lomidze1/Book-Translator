import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, UnauthorizedException, BadRequestException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../../src/auth/auth.service';

// Mock bcrypt
vi.mock('bcrypt', () => ({
  hash: vi.fn(),
  compare: vi.fn(),
}));

vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn().mockImplementation(() => ({
    verifyIdToken: vi.fn(),
  })),
}));

describe('AuthService', () => {
  let authService: AuthService;

  const mockPrismaService = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    account: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  };

  const mockJwtService = {
    signAsync: vi.fn(),
    verify: vi.fn(),
  };

  const mockRedisService = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(undefined),
    secureGet: vi.fn().mockResolvedValue(null),
    secureSet: vi.fn().mockResolvedValue(undefined),
    secureIncr: vi.fn().mockResolvedValue(1),
    isConnected: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Set required env vars for JWT validation
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    // Reset redis defaults
    mockRedisService.get.mockResolvedValue(null);
    mockRedisService.incr.mockResolvedValue(1);
    // Directly instantiate with mocks (bypass NestJS DI)
    authService = new (AuthService as any)(mockPrismaService, mockJwtService, mockRedisService);
  });

  // ============================================================
  // REGISTER
  // ============================================================
  describe('register', () => {
    const registerDto = {
      email: 'test@example.com',
      password: 'securePassword123',
      name: 'გიორგი',
    };

    it('should register a new user successfully', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as any).mockResolvedValue('hashedPassword123');
      mockPrismaService.user.create.mockResolvedValue({
        id: 'user-123',
        email: registerDto.email,
        name: registerDto.name,
      });

      const result = await authService.register(registerDto);

      expect(result).toEqual({
        message: 'Verification email sent',
        userId: 'user-123',
      });
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: registerDto.email },
      });
      expect(bcrypt.hash).toHaveBeenCalledWith(registerDto.password, 12);
      expect(mockPrismaService.user.create).toHaveBeenCalledWith({
        data: {
          email: registerDto.email,
          passwordHash: 'hashedPassword123',
          name: registerDto.name,
        },
      });
    });

    it('should throw ConflictException if email already exists', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'existing-user',
        email: registerDto.email,
      });

      await expect(authService.register(registerDto)).rejects.toThrow(ConflictException);
      await expect(authService.register(registerDto)).rejects.toThrow('EMAIL_ALREADY_EXISTS');
    });

    it('should hash the password with salt rounds of 12', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as any).mockResolvedValue('hashed');
      mockPrismaService.user.create.mockResolvedValue({ id: 'user-1' });

      await authService.register(registerDto);

      expect(bcrypt.hash).toHaveBeenCalledWith(registerDto.password, 12);
    });

    it('should register without name when name is not provided', async () => {
      const dtoWithoutName = { email: 'test@example.com', password: 'securePassword123' };
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as any).mockResolvedValue('hashed');
      mockPrismaService.user.create.mockResolvedValue({ id: 'user-1' });

      await authService.register(dtoWithoutName);

      expect(mockPrismaService.user.create).toHaveBeenCalledWith({
        data: {
          email: dtoWithoutName.email,
          passwordHash: 'hashed',
          name: undefined,
        },
      });
    });
  });

  // ============================================================
  // LOGIN
  // ============================================================
  describe('login', () => {
    const loginDto = {
      email: 'test@example.com',
      password: 'securePassword123',
    };

    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      passwordHash: 'hashedPassword',
      name: 'გიორგი',
      avatar: null,
      tokenVersion: 0,
      emailVerified: new Date('2024-01-01'),
    };

    it('should login successfully with valid credentials', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as any).mockResolvedValue(true);
      mockJwtService.signAsync
        .mockResolvedValueOnce('access-token-123')
        .mockResolvedValueOnce('refresh-token-123');

      const result = await authService.login(loginDto);

      expect(result).toEqual({
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-123',
        user: {
          id: mockUser.id,
          email: mockUser.email,
          name: mockUser.name,
          avatar: mockUser.avatar,
        },
      });
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(authService.login(loginDto)).rejects.toThrow(UnauthorizedException);
      await expect(authService.login(loginDto)).rejects.toThrow('Invalid email or password');
    });

    it('should throw UnauthorizedException if user has no password (OAuth-only user)', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        passwordHash: null,
      });

      await expect(authService.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if password is incorrect', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as any).mockResolvedValue(false);

      await expect(authService.login(loginDto)).rejects.toThrow(UnauthorizedException);
      await expect(authService.login(loginDto)).rejects.toThrow('Invalid email or password');
    });

    it('should throw ForbiddenException if email is not verified', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        emailVerified: null,
      });
      (bcrypt.compare as any).mockResolvedValue(true);

      await expect(authService.login(loginDto)).rejects.toThrow(ForbiddenException);
      await expect(authService.login(loginDto)).rejects.toThrow('EMAIL_NOT_VERIFIED');
    });

    it('should generate access token with 15m expiry and refresh token with 7d expiry', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as any).mockResolvedValue(true);
      mockJwtService.signAsync
        .mockResolvedValueOnce('access')
        .mockResolvedValueOnce('refresh');

      await authService.login(loginDto);

      expect(mockJwtService.signAsync).toHaveBeenCalledWith(
        { sub: mockUser.id, email: mockUser.email, tokenVersion: 0 },
        expect.objectContaining({ expiresIn: '15m' }),
      );
      expect(mockJwtService.signAsync).toHaveBeenCalledWith(
        { sub: mockUser.id, email: mockUser.email, tokenVersion: 0 },
        expect.objectContaining({ expiresIn: '7d' }),
      );
    });
  });

  // ============================================================
  // REFRESH TOKENS
  // ============================================================
  describe('refreshTokens', () => {
    it('should return new tokens when refresh token is valid', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-123', email: 'test@example.com', tokenVersion: 0 });
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        tokenVersion: 0,
      });
      mockJwtService.signAsync
        .mockResolvedValueOnce('new-access-token')
        .mockResolvedValueOnce('new-refresh-token');

      const result = await authService.refreshTokens('valid-refresh-token');

      expect(result).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });
    });

    it('should throw UnauthorizedException if refresh token is invalid', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(authService.refreshTokens('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if user from token does not exist', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'deleted-user', email: 'deleted@test.com' });
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(authService.refreshTokens('orphan-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should verify refresh token with JWT_REFRESH_SECRET', async () => {
      process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
      mockJwtService.verify.mockReturnValue({ sub: 'user-123', tokenVersion: 0 });
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'user-123', email: null, tokenVersion: 0 });
      mockJwtService.signAsync.mockResolvedValue('token');

      await authService.refreshTokens('some-token');

      expect(mockJwtService.verify).toHaveBeenCalledWith('some-token', {
        secret: 'test-refresh-secret',
      });
    });
  });

  // ============================================================
  // GOOGLE AUTH
  // ============================================================
  describe('googleAuth', () => {
    const googleAuthDto = { idToken: 'google-id-token-123' };

    it('should throw UnauthorizedException when Google token verification fails', async () => {
      // The googleClient.verifyIdToken will throw (default mock), causing verifyGoogleToken to return null
      await expect(authService.googleAuth(googleAuthDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ============================================================
  // SEND OTP
  // ============================================================
  describe('sendOtp', () => {
    const sendOtpDto = { phone: '+995599123456' };

    it('should return success message when OTP is sent', async () => {
      // redis.secureGet returns null (no rate limit)
      mockRedisService.secureGet.mockResolvedValue(null);

      const result = await authService.sendOtp(sendOtpDto);

      expect(result).toEqual({ message: 'OTP sent successfully' });
      expect(mockRedisService.secureSet).toHaveBeenCalled();
    });
  });

  // ============================================================
  // VERIFY OTP
  // ============================================================
  describe('verifyOtp', () => {
    const verifyOtpDto = { phone: '+995599123456', code: '123456' };

    it('should throw BadRequestException when OTP is invalid', async () => {
      // redis.get returns null (no stored OTP)
      mockRedisService.get.mockResolvedValue(null);
      mockRedisService.incr.mockResolvedValue(1);

      await expect(authService.verifyOtp(verifyOtpDto)).rejects.toThrow(BadRequestException);
      await expect(authService.verifyOtp(verifyOtpDto)).rejects.toThrow(
        'Invalid or expired OTP',
      );
    });
  });
});
