import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
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

describe('AuthService — Password Reset', () => {
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
  // forgotPassword
  // ============================================================
  describe('forgotPassword', () => {
    const existingUser = {
      id: 'user-1',
      email: 'user@example.com',
      passwordHash: 'hashed-password',
      name: 'გიორგი',
    };

    it('should generate token and send email for existing user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(existingUser);
      mockPrisma.user.update.mockResolvedValue(existingUser);

      const result = await authService.forgotPassword('user@example.com');

      expect(result).toEqual({ message: 'Reset link sent to email' });
      expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
      expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'user@example.com',
        expect.any(String),
        'გიორგი',
      );
    });

    it('should return success even if email does not exist (security)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await authService.forgotPassword('nonexistent@example.com');

      expect(result).toEqual({ message: 'Reset link sent to email' });
      expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('should hash token with SHA-256 before saving to DB', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(existingUser);
      mockPrisma.user.update.mockResolvedValue(existingUser);

      await authService.forgotPassword('user@example.com');

      // The raw token sent via email should differ from what's stored in DB
      const rawToken = mockEmailService.sendPasswordResetEmail.mock.calls[0][1];
      const savedToken = mockPrisma.user.update.mock.calls[0][0].data.passwordResetToken;
      expect(rawToken).not.toBe(savedToken);
      // Verify it's a valid SHA-256 hash (64 hex chars)
      expect(savedToken).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should set passwordResetExpires to ~1 hour from now', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(existingUser);
      mockPrisma.user.update.mockResolvedValue(existingUser);

      await authService.forgotPassword('user@example.com');

      const updateCall = mockPrisma.user.update.mock.calls[0][0];
      const expires = updateCall.data.passwordResetExpires;
      const now = Date.now();
      const oneHourMs = 60 * 60 * 1000;

      expect(expires.getTime()).toBeGreaterThan(now);
      expect(expires.getTime()).toBeLessThanOrEqual(now + oneHourMs + 1000);
    });

    it('should call EmailService.sendPasswordResetEmail with raw token (not hashed)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(existingUser);
      mockPrisma.user.update.mockResolvedValue(existingUser);

      await authService.forgotPassword('user@example.com');

      const sentToken = mockEmailService.sendPasswordResetEmail.mock.calls[0][1];
      // Raw token is hex, 64 chars (32 bytes)
      expect(sentToken).toHaveLength(64);
      expect(sentToken).toMatch(/^[a-f0-9]+$/);
    });

    it('should overwrite previous reset token if requested again', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...existingUser,
        passwordResetToken: 'old-token-hash',
      });
      mockPrisma.user.update.mockResolvedValue(existingUser);

      await authService.forgotPassword('user@example.com');

      expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
      const updateData = mockPrisma.user.update.mock.calls[0][0].data;
      expect(updateData.passwordResetToken).toBeDefined();
      expect(updateData.passwordResetToken).not.toBe('old-token-hash');
    });

    it('should return success for OAuth-only user (no passwordHash)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...existingUser,
        passwordHash: null,
      });

      const result = await authService.forgotPassword('user@example.com');

      expect(result).toEqual({ message: 'Reset link sent to email' });
      expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('should handle email case-insensitively', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await authService.forgotPassword('User@Example.COM');

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
      });
    });

    it('should rate limit: throw after 3 requests in 15 minutes', async () => {
      mockRedis.incr.mockResolvedValue(4); // 4th request

      await expect(authService.forgotPassword('user@example.com')).rejects.toThrow(
        BadRequestException,
      );
      await expect(authService.forgotPassword('user@example.com')).rejects.toThrow(
        'Too many requests',
      );
    });

    it('should set rate limit TTL on first request', async () => {
      mockRedis.incr.mockResolvedValue(1);
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await authService.forgotPassword('user@example.com');

      expect(mockRedis.expire).toHaveBeenCalledWith(
        expect.stringContaining('password-reset:rate:'),
        900,
      );
    });

    it('should handle EmailService failure gracefully', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(existingUser);
      mockPrisma.user.update.mockResolvedValue(existingUser);
      mockEmailService.sendPasswordResetEmail.mockRejectedValueOnce(new Error('SMTP error'));

      // Should throw because email sending is not wrapped in try/catch in forgotPassword
      await expect(authService.forgotPassword('user@example.com')).rejects.toThrow('SMTP error');
    });

    it('should handle DB error gracefully', async () => {
      mockPrisma.user.findUnique.mockRejectedValue(new Error('DB connection error'));

      await expect(authService.forgotPassword('user@example.com')).rejects.toThrow(
        'DB connection error',
      );
    });
  });

  // ============================================================
  // resetPassword
  // ============================================================
  describe('resetPassword', () => {
    const userWithResetToken = {
      id: 'user-1',
      email: 'user@example.com',
      passwordResetToken: 'hashed-token-in-db',
      passwordResetExpires: new Date(Date.now() + 3600000), // 1 hour from now
    };

    it('should reset password with valid token', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(userWithResetToken);
      (bcrypt.hash as any).mockResolvedValue('new-hashed-password');
      mockPrisma.user.update.mockResolvedValue({ ...userWithResetToken });

      const result = await authService.resetPassword('raw-token', 'NewPassword1');

      expect(result).toEqual({ message: 'Password updated successfully' });
    });

    it('should hash the new password with bcrypt (salt 12)', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(userWithResetToken);
      (bcrypt.hash as any).mockResolvedValue('new-hash');
      mockPrisma.user.update.mockResolvedValue({});

      await authService.resetPassword('raw-token', 'NewPassword1');

      expect(bcrypt.hash).toHaveBeenCalledWith('NewPassword1', 12);
    });

    it('should clear reset token fields after successful reset', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(userWithResetToken);
      (bcrypt.hash as any).mockResolvedValue('new-hash');
      mockPrisma.user.update.mockResolvedValue({});

      await authService.resetPassword('raw-token', 'NewPassword1');

      const updateCall = mockPrisma.user.update.mock.calls[0][0];
      expect(updateCall.data.passwordResetToken).toBeNull();
      expect(updateCall.data.passwordResetExpires).toBeNull();
    });

    it('should throw BadRequestException for expired token', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null); // findFirst with gt: new Date() returns null

      await expect(authService.resetPassword('expired-token', 'NewPass1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for invalid/non-existent token', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(authService.resetPassword('fake-token', 'NewPass1')).rejects.toThrow(
        'Invalid or expired reset token',
      );
    });

    it('should correctly hash token before DB lookup', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      try {
        await authService.resetPassword('my-raw-token', 'NewPass1');
      } catch {
        // Expected
      }

      // Verify findFirst was called with a hashed version of the token
      const searchedToken = mockPrisma.user.findFirst.mock.calls[0][0].where.passwordResetToken;
      const expectedHash = crypto.createHash('sha256').update('my-raw-token').digest('hex');
      expect(searchedToken).toBe(expectedHash);
    });

    it('should use findFirst with gt condition for expiry check', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      try {
        await authService.resetPassword('token', 'NewPass1');
      } catch {
        // Expected
      }

      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          passwordResetToken: expect.any(String),
          passwordResetExpires: { gt: expect.any(Date) },
        },
      });
    });

    it('should handle DB update failure', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(userWithResetToken);
      (bcrypt.hash as any).mockResolvedValue('new-hash');
      mockPrisma.user.update.mockRejectedValue(new Error('DB write error'));

      await expect(authService.resetPassword('token', 'NewPass1')).rejects.toThrow(
        'DB write error',
      );
    });

    it('should update passwordHash in DB', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(userWithResetToken);
      (bcrypt.hash as any).mockResolvedValue('brand-new-hash');
      mockPrisma.user.update.mockResolvedValue({});

      await authService.resetPassword('token', 'NewPass1');

      const updateCall = mockPrisma.user.update.mock.calls[0][0];
      expect(updateCall.data.passwordHash).toBe('brand-new-hash');
    });
  });
});
