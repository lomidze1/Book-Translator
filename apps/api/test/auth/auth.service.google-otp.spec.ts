import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from '../../src/auth/auth.service';

vi.mock('bcrypt', () => ({
  hash: vi.fn(),
  compare: vi.fn(),
}));

vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn().mockImplementation(() => ({
    verifyIdToken: vi.fn(),
  })),
}));

describe('AuthService — Google Auth & OTP (coverage)', () => {
  let authService: AuthService;

  const mockPrisma = {
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
    mockRedisService.get.mockResolvedValue(null);
    mockRedisService.incr.mockResolvedValue(1);
    authService = new (AuthService as any)(mockPrisma, mockJwt, mockRedisService);
  });

  // ============================================================
  // GOOGLE AUTH — Full Coverage
  // ============================================================
  describe('googleAuth — full flow', () => {
    const googleAuthDto = { idToken: 'valid-google-token' };

    const googlePayload = {
      email: 'google@example.com',
      name: 'Google User',
      picture: 'https://example.com/photo.jpg',
      sub: 'google-account-id-123',
    };

    it('should throw UnauthorizedException when google token returns null', async () => {
      // Mock verifyGoogleToken to return null
      (authService as any).verifyGoogleToken = vi.fn().mockResolvedValue(null);

      await expect(authService.googleAuth(googleAuthDto)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(authService.googleAuth(googleAuthDto)).rejects.toThrow(
        'Invalid Google token',
      );
    });

    it('should throw UnauthorizedException when google payload has no email', async () => {
      (authService as any).verifyGoogleToken = vi.fn().mockResolvedValue({
        ...googlePayload,
        email: null,
      });

      await expect(authService.googleAuth(googleAuthDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should create new user when Google user does not exist', async () => {
      (authService as any).verifyGoogleToken = vi.fn().mockResolvedValue(googlePayload);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'new-user-1',
        email: googlePayload.email,
        name: googlePayload.name,
        avatar: googlePayload.picture,
      });
      mockJwt.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const result = await authService.googleAuth(googleAuthDto);

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          email: googlePayload.email,
          emailVerified: expect.any(Date),
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
      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: {
          id: 'new-user-1',
          email: googlePayload.email,
          name: googlePayload.name,
          avatar: googlePayload.picture,
        },
      });
    });

    it('should link Google account when existing user has no linked account', async () => {
      const existingUser = {
        id: 'existing-user-1',
        email: googlePayload.email,
        name: 'Existing Name',
        avatar: null,
      };

      (authService as any).verifyGoogleToken = vi.fn().mockResolvedValue(googlePayload);
      mockPrisma.user.findUnique.mockResolvedValue(existingUser);
      mockPrisma.account.findUnique.mockResolvedValue(null);
      mockPrisma.account.create.mockResolvedValue({});
      mockJwt.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const result = await authService.googleAuth(googleAuthDto);

      expect(mockPrisma.account.findUnique).toHaveBeenCalledWith({
        where: {
          provider_providerAccountId: {
            provider: 'google',
            providerAccountId: googlePayload.sub,
          },
        },
      });
      expect(mockPrisma.account.create).toHaveBeenCalledWith({
        data: {
          userId: existingUser.id,
          provider: 'google',
          providerAccountId: googlePayload.sub,
        },
      });
      expect(result.user.id).toBe('existing-user-1');
    });

    it('should skip linking when Google account already linked', async () => {
      const existingUser = {
        id: 'existing-user-1',
        email: googlePayload.email,
        name: 'Existing Name',
        avatar: 'https://example.com/avatar.jpg',
      };

      (authService as any).verifyGoogleToken = vi.fn().mockResolvedValue(googlePayload);
      mockPrisma.user.findUnique.mockResolvedValue(existingUser);
      mockPrisma.account.findUnique.mockResolvedValue({
        id: 'account-1',
        provider: 'google',
        providerAccountId: googlePayload.sub,
      });
      mockJwt.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const result = await authService.googleAuth(googleAuthDto);

      expect(mockPrisma.account.create).not.toHaveBeenCalled();
      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: {
          id: existingUser.id,
          email: existingUser.email,
          name: existingUser.name,
          avatar: existingUser.avatar,
        },
      });
    });

    it('should generate tokens with user id and email', async () => {
      (authService as any).verifyGoogleToken = vi.fn().mockResolvedValue(googlePayload);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: googlePayload.email,
        name: null,
        avatar: null,
      });
      mockJwt.signAsync.mockResolvedValue('token');

      await authService.googleAuth(googleAuthDto);

      expect(mockJwt.signAsync).toHaveBeenCalledWith(
        { sub: 'user-1', email: googlePayload.email },
        expect.objectContaining({ expiresIn: '15m' }),
      );
      expect(mockJwt.signAsync).toHaveBeenCalledWith(
        { sub: 'user-1', email: googlePayload.email },
        expect.objectContaining({ expiresIn: '30d' }),
      );
    });
  });

  // ============================================================
  // VERIFY OTP — Full Coverage
  // ============================================================
  describe('verifyOtp — full flow', () => {
    const verifyOtpDto = { phone: '+995599123456', code: '123456' };

    it('should throw BadRequestException when OTP is invalid', async () => {
      // validateOtp: incr returns 1 (under limit), get returns null (no stored OTP)
      mockRedisService.incr.mockResolvedValue(1);
      mockRedisService.get.mockResolvedValue(null);

      await expect(authService.verifyOtp(verifyOtpDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(authService.verifyOtp(verifyOtpDto)).rejects.toThrow(
        'Invalid or expired OTP',
      );
    });

    it('should create new user when phone does not exist', async () => {
      // Mock validateOtp to succeed: stored OTP matches
      mockRedisService.incr.mockResolvedValue(1);
      mockRedisService.get.mockResolvedValue('123456');

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'new-phone-user',
        email: null,
        name: null,
        avatar: null,
      });
      mockJwt.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const result = await authService.verifyOtp(verifyOtpDto);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { phone: verifyOtpDto.phone },
      });
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          phone: verifyOtpDto.phone,
          phoneVerified: true,
        },
      });
      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: {
          id: 'new-phone-user',
          email: null,
          name: null,
          avatar: null,
        },
      });
    });

    it('should update existing user phoneVerified when phone exists', async () => {
      const existingUser = {
        id: 'existing-phone-user',
        email: 'user@example.com',
        name: 'არსებული მომხმარებელი',
        avatar: null,
      };

      mockRedisService.incr.mockResolvedValue(1);
      mockRedisService.get.mockResolvedValue('123456');

      mockPrisma.user.findUnique.mockResolvedValue(existingUser);
      mockPrisma.user.update.mockResolvedValue({
        ...existingUser,
        phoneVerified: true,
      });
      mockJwt.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const result = await authService.verifyOtp(verifyOtpDto);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: existingUser.id },
        data: { phoneVerified: true },
      });
      expect(result.user.id).toBe('existing-phone-user');
      expect(result.user.name).toBe('არსებული მომხმარებელი');
    });

    it('should generate tokens after successful OTP verification', async () => {
      const user = {
        id: 'user-1',
        email: 'test@example.com',
        name: null,
        avatar: null,
      };

      mockRedisService.incr.mockResolvedValue(1);
      mockRedisService.get.mockResolvedValue('123456');

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(user);
      mockJwt.signAsync.mockResolvedValue('token');

      await authService.verifyOtp(verifyOtpDto);

      expect(mockJwt.signAsync).toHaveBeenCalledTimes(2);
    });

    it('should handle Georgian phone numbers', async () => {
      const georgianDto = { phone: '+995577123456', code: '654321' };

      mockRedisService.incr.mockResolvedValue(1);
      mockRedisService.get.mockResolvedValue('654321');

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'ge-user',
        email: null,
        name: null,
        avatar: null,
      });
      mockJwt.signAsync.mockResolvedValue('token');

      const result = await authService.verifyOtp(georgianDto);

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          phone: '+995577123456',
          phoneVerified: true,
        },
      });
      expect(result.user.id).toBe('ge-user');
    });
  });
});
