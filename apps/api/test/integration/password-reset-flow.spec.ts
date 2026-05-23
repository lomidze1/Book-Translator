import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
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

describe('Integration — Password Reset & Email Verification Flows', () => {
  let authService: AuthService;

  // Simulated DB state
  let dbUsers: Record<string, any>;

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
    signAsync: vi.fn().mockResolvedValue('mock-token'),
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
    sendPasswordChangeConfirmation: vi.fn().mockResolvedValue(undefined),
  };

  // AuthService now also takes ConfigService — the constructor reads
  // GOOGLE_CLIENT_ID, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET from it.
  const mockConfig = {
    get: vi.fn((key: string) => {
      const map: Record<string, string | undefined> = {
        GOOGLE_CLIENT_ID: 'test-google-client-id',
        JWT_ACCESS_SECRET: 'test-access-secret',
        JWT_REFRESH_SECRET: 'test-refresh-secret',
      };
      return map[key] ?? process.env[key];
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_ACCESS_SECRET = 'test-access-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
    mockRedis.get.mockResolvedValue(null);
    mockRedis.incr.mockResolvedValue(1);
    mockRedis.secureIncr.mockResolvedValue(1);
    dbUsers = {};
    authService = new (AuthService as any)(
      mockPrisma,
      mockJwt,
      mockRedis,
      mockEmailService,
      mockConfig,
    );
  });

  // ============================================================
  // Full Forgot Password → Reset Flow
  // ============================================================
  describe('Forgot Password → Reset Password Flow', () => {
    it('should complete full password reset flow', async () => {
      // Step 1: User exists with password
      const user = {
        id: 'user-1',
        email: 'user@example.com',
        passwordHash: 'old-hashed-password',
        name: 'გიორგი',
      };
      mockPrisma.user.findUnique.mockResolvedValue(user);

      let savedResetToken: string | null = null;
      mockPrisma.user.update.mockImplementation(async ({ data }) => {
        if (data.passwordResetToken) {
          savedResetToken = data.passwordResetToken;
        }
        return user;
      });

      // Step 2: Request password reset
      const forgotResult = await authService.forgotPassword('user@example.com');
      expect(forgotResult.message).toBe('Reset link sent to email');

      // Step 3: Get raw token that was sent via email
      const rawToken = mockEmailService.sendPasswordResetEmail.mock.calls[0][1];
      expect(rawToken).toBeDefined();
      expect(rawToken).toHaveLength(64);

      // Step 4: Verify the hashed version was saved to DB
      const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      expect(savedResetToken).toBe(expectedHash);

      // Step 5: Reset password with raw token
      mockPrisma.user.findFirst.mockResolvedValue({
        ...user,
        passwordResetToken: savedResetToken,
        passwordResetExpires: new Date(Date.now() + 3600000),
      });
      (bcrypt.hash as any).mockResolvedValue('new-hashed-password');
      mockPrisma.user.update.mockResolvedValue({});

      const resetResult = await authService.resetPassword(rawToken, 'NewSecure1');
      expect(resetResult.message).toBe('Password updated successfully');
    });

    it('should fail reset with wrong token', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        authService.resetPassword('wrong-token', 'NewPass1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should fail reset after token expires', async () => {
      // findFirst returns null because passwordResetExpires < now
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(
        authService.resetPassword('expired-token', 'NewPass1'),
      ).rejects.toThrow('Invalid or expired reset token');
    });
  });

  // ============================================================
  // Register → Verify Email Flow
  // ============================================================
  describe('Register → Verify Email Flow', () => {
    it('should complete registration and email verification', async () => {
      // Step 1: Register
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as any).mockResolvedValue('hashed-pw');
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: 'new@example.com',
        name: 'მარიამი',
      });

      let savedVerificationToken: string | null = null;
      mockPrisma.user.update.mockImplementation(async ({ data }) => {
        if (data.emailVerificationToken) {
          savedVerificationToken = data.emailVerificationToken;
        }
        return {};
      });

      const registerResult = await authService.register({
        email: 'new@example.com',
        password: 'SecurePass1',
        name: 'მარიამი',
      });
      expect(registerResult.userId).toBe('user-1');

      // Step 2: Get raw token from email
      const rawToken = mockEmailService.sendEmailVerification.mock.calls[0][1];
      expect(rawToken).toHaveLength(64);

      // Step 3: Verify email
      const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      mockPrisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'new@example.com',
        emailVerified: null,
        emailVerificationToken: expectedHash,
        emailVerificationExpires: new Date(Date.now() + 86400000),
      });
      mockPrisma.user.update.mockResolvedValue({});

      const verifyResult = await authService.verifyEmail(rawToken);
      expect(verifyResult.message).toBe('Email verified successfully');
    });
  });

  // ============================================================
  // Edge Case Flows
  // ============================================================
  describe('Edge Case Flows', () => {
    it('forgot password for non-existent email should not leak info', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await authService.forgotPassword('ghost@example.com');

      expect(result.message).toBe('Reset link sent to email');
      expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('forgot password for Google OAuth user should not send email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'google@example.com',
        passwordHash: null, // OAuth user — no password
        name: 'OAuth User',
      });

      const result = await authService.forgotPassword('google@example.com');

      expect(result.message).toBe('Reset link sent to email');
      expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('requesting reset twice should invalidate first token', async () => {
      const user = {
        id: 'user-1',
        email: 'user@example.com',
        passwordHash: 'hash',
        name: null,
      };
      mockPrisma.user.findUnique.mockResolvedValue(user);

      const tokens: string[] = [];
      mockPrisma.user.update.mockImplementation(async ({ data }) => {
        if (data.passwordResetToken) {
          tokens.push(data.passwordResetToken);
        }
        return user;
      });

      await authService.forgotPassword('user@example.com');
      await authService.forgotPassword('user@example.com');

      // Two different hashed tokens should have been saved
      expect(tokens).toHaveLength(2);
      expect(tokens[0]).not.toBe(tokens[1]);
    });

    it('resend verification for already verified email should fail', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'verified@example.com',
        emailVerified: new Date(),
      });

      await expect(
        authService.resendVerificationEmail('verified@example.com'),
      ).rejects.toThrow('Email is already verified');
    });
  });
});
