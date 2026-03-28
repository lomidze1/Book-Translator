import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
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

describe('AuthService — Email Verification', () => {
  let authService: AuthService;

  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
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

  const mockRedis = {
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

  const mockEmailService = {
    sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
    sendEmailVerification: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockRedis.incr.mockResolvedValue(1);
    authService = new (AuthService as any)(mockPrisma, mockJwt, mockRedis, mockEmailService);
  });

  // ============================================================
  // register (updated — sends verification email)
  // ============================================================
  describe('register (with email verification)', () => {
    const registerDto = {
      email: 'test@example.com',
      password: 'SecurePass1',
      name: 'გიორგი',
    };

    it('should generate verification token on registration', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as any).mockResolvedValue('hashed');
      mockPrisma.user.create.mockResolvedValue({ id: 'user-1', email: registerDto.email, name: registerDto.name });
      mockPrisma.user.update.mockResolvedValue({});

      await authService.register(registerDto);

      expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
      const updateData = mockPrisma.user.update.mock.calls[0][0].data;
      expect(updateData.emailVerificationToken).toBeDefined();
      expect(typeof updateData.emailVerificationToken).toBe('string');
    });

    it('should save hashed token to DB (not raw)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as any).mockResolvedValue('hashed');
      mockPrisma.user.create.mockResolvedValue({ id: 'user-1', email: registerDto.email, name: registerDto.name });
      mockPrisma.user.update.mockResolvedValue({});

      await authService.register(registerDto);

      // The raw token sent via email should differ from what's stored in DB
      const rawToken = mockEmailService.sendEmailVerification.mock.calls[0][1];
      const savedToken = mockPrisma.user.update.mock.calls[0][0].data.emailVerificationToken;
      expect(rawToken).not.toBe(savedToken);
      // Verify it's a valid SHA-256 hash (64 hex chars)
      expect(savedToken).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should set emailVerificationExpires to 24 hours', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as any).mockResolvedValue('hashed');
      mockPrisma.user.create.mockResolvedValue({ id: 'user-1', email: registerDto.email, name: registerDto.name });
      mockPrisma.user.update.mockResolvedValue({});

      await authService.register(registerDto);

      const updateData = mockPrisma.user.update.mock.calls[0][0].data;
      const expires = updateData.emailVerificationExpires;
      const now = Date.now();
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;

      expect(expires.getTime()).toBeGreaterThan(now);
      expect(expires.getTime()).toBeLessThanOrEqual(now + twentyFourHoursMs + 1000);
    });

    it('should call EmailService.sendEmailVerification', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as any).mockResolvedValue('hashed');
      mockPrisma.user.create.mockResolvedValue({ id: 'user-1', email: registerDto.email, name: registerDto.name });
      mockPrisma.user.update.mockResolvedValue({});

      await authService.register(registerDto);

      expect(mockEmailService.sendEmailVerification).toHaveBeenCalledWith(
        'test@example.com',
        expect.any(String), // raw token
        'გიორგი',
      );
    });

    it('should handle email sending failure (user still created)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as any).mockResolvedValue('hashed');
      mockPrisma.user.create.mockResolvedValue({ id: 'user-1', email: registerDto.email, name: registerDto.name });
      mockPrisma.user.update.mockResolvedValue({});
      mockEmailService.sendEmailVerification.mockRejectedValueOnce(new Error('SMTP down'));

      // Should NOT throw — email failure is caught
      const result = await authService.register(registerDto);
      expect(result.userId).toBe('user-1');
    });

    it('should still return userId and message', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as any).mockResolvedValue('hashed');
      mockPrisma.user.create.mockResolvedValue({ id: 'user-1', email: registerDto.email, name: registerDto.name });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await authService.register(registerDto);

      expect(result).toEqual({
        message: 'Verification email sent',
        userId: 'user-1',
      });
    });
  });

  // ============================================================
  // verifyEmail
  // ============================================================
  describe('verifyEmail', () => {
    const verifiedUser = {
      id: 'user-1',
      email: 'user@example.com',
      emailVerified: null,
      emailVerificationToken: 'hashed-token',
      emailVerificationExpires: new Date(Date.now() + 86400000),
    };

    it('should verify email with valid token', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(verifiedUser);
      mockPrisma.user.update.mockResolvedValue({});

      const result = await authService.verifyEmail('raw-token');

      expect(result).toEqual({ message: 'Email verified successfully' });
    });

    it('should set emailVerified to current timestamp', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(verifiedUser);
      mockPrisma.user.update.mockResolvedValue({});

      await authService.verifyEmail('raw-token');

      const updateData = mockPrisma.user.update.mock.calls[0][0].data;
      expect(updateData.emailVerified).toBeInstanceOf(Date);
    });

    it('should clear verification token fields after success', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(verifiedUser);
      mockPrisma.user.update.mockResolvedValue({});

      await authService.verifyEmail('raw-token');

      const updateData = mockPrisma.user.update.mock.calls[0][0].data;
      expect(updateData.emailVerificationToken).toBeNull();
      expect(updateData.emailVerificationExpires).toBeNull();
    });

    it('should throw BadRequestException for expired token', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(authService.verifyEmail('expired-token')).rejects.toThrow(BadRequestException);
      await expect(authService.verifyEmail('expired-token')).rejects.toThrow(
        'Invalid or expired verification token',
      );
    });

    it('should throw BadRequestException for invalid token', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(authService.verifyEmail('bad-token')).rejects.toThrow(BadRequestException);
    });

    it('should return success if email already verified', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({
        ...verifiedUser,
        emailVerified: new Date(),
      });

      const result = await authService.verifyEmail('token');

      expect(result).toEqual({ message: 'Email already verified' });
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('should handle DB failure gracefully', async () => {
      mockPrisma.user.findFirst.mockRejectedValue(new Error('DB error'));

      await expect(authService.verifyEmail('token')).rejects.toThrow('DB error');
    });

    it('should correctly SHA-256 hash token before lookup', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      try {
        await authService.verifyEmail('my-token');
      } catch {
        // Expected
      }

      // Verify findFirst was called with a hashed version of the token
      const searchedToken = mockPrisma.user.findFirst.mock.calls[0][0].where.emailVerificationToken;
      const expectedHash = crypto.createHash('sha256').update('my-token').digest('hex');
      expect(searchedToken).toBe(expectedHash);
    });
  });

  // ============================================================
  // resendVerificationEmail
  // ============================================================
  describe('resendVerificationEmail', () => {
    it('should generate new token and send email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        emailVerified: null,
        name: 'გიორგი',
      });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await authService.resendVerificationEmail('user@example.com');

      expect(result).toEqual({ message: 'Verification email sent' });
      expect(mockEmailService.sendEmailVerification).toHaveBeenCalledTimes(1);
    });

    it('should throw if email already verified', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        emailVerified: new Date(),
      });

      await expect(authService.resendVerificationEmail('user@example.com')).rejects.toThrow(
        'Email is already verified',
      );
    });

    it('should return success if user not found (security)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await authService.resendVerificationEmail('nobody@example.com');

      expect(result).toEqual({ message: 'Verification email sent' });
      expect(mockEmailService.sendEmailVerification).not.toHaveBeenCalled();
    });

    it('should invalidate previous token by overwriting', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        emailVerified: null,
        emailVerificationToken: 'old-hashed-token',
        name: null,
      });
      mockPrisma.user.update.mockResolvedValue({});

      await authService.resendVerificationEmail('user@example.com');

      const updateData = mockPrisma.user.update.mock.calls[0][0].data;
      expect(updateData.emailVerificationToken).toBeDefined();
      expect(updateData.emailVerificationToken).not.toBe('old-hashed-token');
    });
  });
});
