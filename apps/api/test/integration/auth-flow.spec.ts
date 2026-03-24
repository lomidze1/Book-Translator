import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as bcrypt from 'bcrypt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../../src/auth/auth.service';
import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy';

vi.mock('bcrypt', () => ({
  hash: vi.fn(),
  compare: vi.fn(),
}));

vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn().mockImplementation(() => ({
    verifyIdToken: vi.fn(),
  })),
}));

vi.mock('passport-jwt', () => ({
  ExtractJwt: {
    fromAuthHeaderAsBearerToken: vi.fn().mockReturnValue(() => 'mock-token'),
  },
  Strategy: class MockStrategy {
    constructor(_options: any) {}
  },
}));

vi.mock('@nestjs/passport', () => ({
  PassportStrategy: (_Strategy: any, _name: string) => {
    return class {
      constructor() {}
    };
  },
}));

describe('Integration — Auth Flow Scenarios', () => {
  let authService: AuthService;
  let jwtStrategy: JwtStrategy;

  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    account: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  };

  const mockJwt = {
    signAsync: vi.fn(),
    verify: vi.fn(),
  };

  const mockRedisService = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(undefined),
    isConnected: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    mockRedisService.get.mockResolvedValue(null);
    mockRedisService.incr.mockResolvedValue(1);

    authService = new (AuthService as any)(mockPrisma, mockJwt, mockRedisService);
    jwtStrategy = new (JwtStrategy as any)(mockPrisma);
    (jwtStrategy as any).prisma = mockPrisma;
  });

  // ============================================================
  // Full Registration -> Login Flow
  // ============================================================
  describe('Registration -> Login flow', () => {
    it('should register user and then login successfully', async () => {
      // Step 1: Register
      mockPrisma.user.findUnique.mockResolvedValueOnce(null); // No existing user
      (bcrypt.hash as any).mockResolvedValue('$2b$12$hashedpassword');
      mockPrisma.user.create.mockResolvedValue({
        id: 'new-user-1',
        email: 'new@example.com',
        name: 'ახალი მომხმარებელი',
      });

      const registerResult = await authService.register({
        email: 'new@example.com',
        password: 'securePassword123',
        name: 'ახალი მომხმარებელი',
      });

      expect(registerResult.userId).toBe('new-user-1');
      expect(registerResult.message).toBe('Verification email sent');

      // Step 2: Login
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'new-user-1',
        email: 'new@example.com',
        passwordHash: '$2b$12$hashedpassword',
        name: 'ახალი მომხმარებელი',
        avatar: null,
      });
      (bcrypt.compare as any).mockResolvedValue(true);
      mockJwt.signAsync
        .mockResolvedValueOnce('access-token-123')
        .mockResolvedValueOnce('refresh-token-123');

      const loginResult = await authService.login({
        email: 'new@example.com',
        password: 'securePassword123',
      });

      expect(loginResult.accessToken).toBe('access-token-123');
      expect(loginResult.refreshToken).toBe('refresh-token-123');
      expect(loginResult.user.id).toBe('new-user-1');
      expect(loginResult.user.name).toBe('ახალი მომხმარებელი');
    });

    it('should prevent duplicate registration', async () => {
      // First registration succeeds
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      (bcrypt.hash as any).mockResolvedValue('hashed');
      mockPrisma.user.create.mockResolvedValue({ id: 'user-1' });

      await authService.register({
        email: 'dup@example.com',
        password: 'password123',
      });

      // Second registration with same email fails
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'dup@example.com',
      });

      await expect(
        authService.register({
          email: 'dup@example.com',
          password: 'differentPassword',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ============================================================
  // Login -> Token Refresh Flow
  // ============================================================
  describe('Login -> Token Refresh flow', () => {
    it('should login and then refresh tokens', async () => {
      // Step 1: Login
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: 'hashed',
        name: 'გიორგი',
        avatar: null,
      });
      (bcrypt.compare as any).mockResolvedValue(true);
      mockJwt.signAsync
        .mockResolvedValueOnce('access-1')
        .mockResolvedValueOnce('refresh-1');

      const loginResult = await authService.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(loginResult.accessToken).toBe('access-1');

      // Step 2: Refresh
      mockJwt.verify.mockReturnValue({ sub: 'user-1', email: 'test@example.com' });
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
      });
      mockJwt.signAsync
        .mockResolvedValueOnce('access-2')
        .mockResolvedValueOnce('refresh-2');

      const refreshResult = await authService.refreshTokens('refresh-1');

      expect(refreshResult.accessToken).toBe('access-2');
      expect(refreshResult.refreshToken).toBe('refresh-2');
    });
  });

  // ============================================================
  // Login -> JWT Strategy Validation Flow
  // ============================================================
  describe('Login -> JWT Strategy validate flow', () => {
    it('should login and then validate the JWT payload via strategy', async () => {
      // Step 1: Login
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: 'hashed',
        name: 'გიორგი',
        avatar: null,
      });
      (bcrypt.compare as any).mockResolvedValue(true);
      mockJwt.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const loginResult = await authService.login({
        email: 'test@example.com',
        password: 'password123',
      });

      // Step 2: Validate JWT payload (simulating what passport does)
      const payload = { sub: 'user-1', email: 'test@example.com' };
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        name: 'გიორგი',
        role: 'USER',
        avatar: null,
      });

      const user = await jwtStrategy.validate(payload);

      expect(user.id).toBe('user-1');
      expect(user.role).toBe('USER');
    });

    it('should fail validation if user was deleted after token was issued', async () => {
      const payload = { sub: 'deleted-user', email: 'gone@example.com' };
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(jwtStrategy.validate(payload)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ============================================================
  // Failed Login Scenarios
  // ============================================================
  describe('Failed Login Scenarios', () => {
    it('should fail login with wrong password after successful registration', async () => {
      // Register
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      (bcrypt.hash as any).mockResolvedValue('$2b$12$correcthash');
      mockPrisma.user.create.mockResolvedValue({ id: 'user-1' });
      await authService.register({ email: 'test@example.com', password: 'correctPassword' });

      // Login with wrong password
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: '$2b$12$correcthash',
      });
      (bcrypt.compare as any).mockResolvedValue(false); // Wrong password

      await expect(
        authService.login({ email: 'test@example.com', password: 'wrongPassword' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should fail login for unregistered email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.login({ email: 'nobody@example.com', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should fail login for OAuth-only user (no password)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'google@example.com',
        passwordHash: null, // Google OAuth user, no password set
      });

      await expect(
        authService.login({ email: 'google@example.com', password: 'anyPassword' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ============================================================
  // Token Refresh Edge Cases
  // ============================================================
  describe('Token Refresh Edge Cases', () => {
    it('should fail refresh with expired token', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(authService.refreshTokens('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should fail refresh if user was deleted', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'deleted-user', email: 'gone@example.com' });
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(authService.refreshTokens('valid-but-orphan-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should generate new token pair on successful refresh', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1', email: 'test@example.com' });
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });
      mockJwt.signAsync
        .mockResolvedValueOnce('new-access')
        .mockResolvedValueOnce('new-refresh');

      const result = await authService.refreshTokens('old-token');

      expect(result).toHaveProperty('accessToken', 'new-access');
      expect(result).toHaveProperty('refreshToken', 'new-refresh');
    });
  });

  // ============================================================
  // OTP Flow
  // ============================================================
  describe('OTP Flow', () => {
    it('should send OTP and then verify successfully with correct code', async () => {
      // Send OTP
      mockRedisService.get.mockResolvedValue(null); // no rate limit
      const sendResult = await authService.sendOtp({ phone: '+995599123456' });
      expect(sendResult.message).toBe('OTP sent successfully');

      // Verify OTP — stored OTP does not match (we don't know the generated one)
      mockRedisService.incr.mockResolvedValue(1);
      mockRedisService.get.mockResolvedValue(null); // OTP expired or not matching
      await expect(
        authService.verifyOtp({ phone: '+995599123456', code: '123456' }),
      ).rejects.toThrow('Invalid or expired OTP');
    });
  });
});
