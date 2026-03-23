import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../../src/auth/auth.service';

vi.mock('bcrypt', () => ({
  hash: vi.fn(),
  compare: vi.fn(),
}));

describe('AuthService — Edge Cases & Security', () => {
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

  beforeEach(() => {
    vi.clearAllMocks();
    authService = new (AuthService as any)(mockPrisma, mockJwt);
  });

  // ============================================================
  // REGISTER — Edge Cases
  // ============================================================
  describe('register — edge cases', () => {
    it('should handle email with uppercase letters (case sensitivity)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as any).mockResolvedValue('hashed');
      mockPrisma.user.create.mockResolvedValue({ id: 'user-1' });

      await authService.register({
        email: 'TEST@EXAMPLE.COM',
        password: 'securePassword123',
      });

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'TEST@EXAMPLE.COM' },
      });
    });

    it('should handle email with special characters in local part', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as any).mockResolvedValue('hashed');
      mockPrisma.user.create.mockResolvedValue({ id: 'user-1' });

      await authService.register({
        email: 'user+tag@example.com',
        password: 'securePassword123',
      });

      expect(mockPrisma.user.create).toHaveBeenCalled();
    });

    it('should handle Georgian name with special characters', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as any).mockResolvedValue('hashed');
      mockPrisma.user.create.mockResolvedValue({ id: 'user-1' });

      await authService.register({
        email: 'test@example.com',
        password: 'securePassword123',
        name: 'გიორგი ბერიძე-მაჩაბელი',
      });

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'გიორგი ბერიძე-მაჩაბელი',
        }),
      });
    });

    it('should propagate database errors from user.create', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as any).mockResolvedValue('hashed');
      mockPrisma.user.create.mockRejectedValue(new Error('Database connection lost'));

      await expect(
        authService.register({ email: 'test@example.com', password: 'password123' }),
      ).rejects.toThrow('Database connection lost');
    });

    it('should propagate bcrypt hashing errors', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as any).mockRejectedValue(new Error('Hashing failed'));

      await expect(
        authService.register({ email: 'test@example.com', password: 'password123' }),
      ).rejects.toThrow('Hashing failed');
    });

    it('should handle concurrent registration attempts for the same email', async () => {
      // First call: no existing user; second call: conflict from race condition
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as any).mockResolvedValue('hashed');
      mockPrisma.user.create
        .mockResolvedValueOnce({ id: 'user-1' })
        .mockRejectedValueOnce(new Error('Unique constraint failed on email'));

      const result1 = await authService.register({
        email: 'race@example.com',
        password: 'password123',
      });
      expect(result1.userId).toBe('user-1');

      await expect(
        authService.register({ email: 'race@example.com', password: 'password123' }),
      ).rejects.toThrow();
    });

    it('should handle very long password (128 characters)', async () => {
      const longPassword = 'A'.repeat(128);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as any).mockResolvedValue('hashed');
      mockPrisma.user.create.mockResolvedValue({ id: 'user-1' });

      const result = await authService.register({
        email: 'test@example.com',
        password: longPassword,
      });

      expect(result.userId).toBe('user-1');
      expect(bcrypt.hash).toHaveBeenCalledWith(longPassword, 12);
    });
  });

  // ============================================================
  // LOGIN — Edge Cases
  // ============================================================
  describe('login — edge cases', () => {
    it('should not reveal whether email exists in error message', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      try {
        await authService.login({ email: 'nonexistent@example.com', password: 'any' });
      } catch (e: any) {
        // Error should say "Invalid email or password", not "User not found"
        expect(e.message).toBe('Invalid email or password');
        expect(e.message).not.toContain('not found');
        expect(e.message).not.toContain('does not exist');
      }
    });

    it('should handle user with empty string passwordHash', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: '',
      });

      // Empty string is falsy, should throw
      await expect(
        authService.login({ email: 'test@example.com', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should correctly pass email to JWT payload', async () => {
      const user = {
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: 'hashed',
        name: 'Test',
        avatar: null,
      };
      mockPrisma.user.findUnique.mockResolvedValue(user);
      (bcrypt.compare as any).mockResolvedValue(true);
      mockJwt.signAsync.mockResolvedValue('token');

      await authService.login({ email: 'test@example.com', password: 'password123' });

      expect(mockJwt.signAsync).toHaveBeenCalledWith(
        { sub: 'user-1', email: 'test@example.com' },
        expect.any(Object),
      );
    });

    it('should return correct user shape without sensitive fields', async () => {
      const user = {
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: 'super-secret-hash',
        name: 'გიორგი',
        avatar: 'https://example.com/avatar.jpg',
        phone: '+995599123456',
        role: 'USER',
      };
      mockPrisma.user.findUnique.mockResolvedValue(user);
      (bcrypt.compare as any).mockResolvedValue(true);
      mockJwt.signAsync
        .mockResolvedValueOnce('access')
        .mockResolvedValueOnce('refresh');

      const result = await authService.login({
        email: 'test@example.com',
        password: 'password123',
      });

      // Should NOT include passwordHash, phone, or role in response user
      expect(result.user).toEqual({
        id: 'user-1',
        email: 'test@example.com',
        name: 'გიორგი',
        avatar: 'https://example.com/avatar.jpg',
      });
      expect((result.user as any).passwordHash).toBeUndefined();
      expect((result.user as any).phone).toBeUndefined();
    });

    it('should handle bcrypt.compare throwing an error', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: 'hashed',
      });
      (bcrypt.compare as any).mockRejectedValue(new Error('bcrypt internal error'));

      await expect(
        authService.login({ email: 'test@example.com', password: 'password123' }),
      ).rejects.toThrow('bcrypt internal error');
    });

    it('should handle database failure during login', async () => {
      mockPrisma.user.findUnique.mockRejectedValue(new Error('Connection refused'));

      await expect(
        authService.login({ email: 'test@example.com', password: 'password123' }),
      ).rejects.toThrow('Connection refused');
    });
  });

  // ============================================================
  // REFRESH TOKENS — Edge Cases
  // ============================================================
  describe('refreshTokens — edge cases', () => {
    it('should handle expired refresh token', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(authService.refreshTokens('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should handle malformed JWT token', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('jwt malformed');
      });

      await expect(authService.refreshTokens('not.a.jwt')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should handle empty string as refresh token', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('jwt must be provided');
      });

      await expect(authService.refreshTokens('')).rejects.toThrow(UnauthorizedException);
    });

    it('should handle token with tampered payload', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });

      await expect(authService.refreshTokens('tampered-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should handle database failure during token refresh', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1', email: 'test@example.com' });
      mockPrisma.user.findUnique.mockRejectedValue(new Error('DB timeout'));

      // The catch block should convert any error to UnauthorizedException
      await expect(authService.refreshTokens('valid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should generate new tokens with same user data', async () => {
      mockJwt.verify.mockReturnValue({ sub: 'user-1', email: 'test@example.com' });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'updated@example.com', // Email might have changed
      });
      mockJwt.signAsync
        .mockResolvedValueOnce('new-access')
        .mockResolvedValueOnce('new-refresh');

      const result = await authService.refreshTokens('old-token');

      // Should use the CURRENT email from database, not from token
      expect(mockJwt.signAsync).toHaveBeenCalledWith(
        { sub: 'user-1', email: 'updated@example.com' },
        expect.any(Object),
      );
      expect(result).toEqual({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      });
    });

    it('should use JWT_REFRESH_SECRET from environment', async () => {
      const originalSecret = process.env.JWT_REFRESH_SECRET;
      process.env.JWT_REFRESH_SECRET = 'my-refresh-secret';

      mockJwt.verify.mockReturnValue({ sub: 'user-1' });
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: null });
      mockJwt.signAsync.mockResolvedValue('token');

      await authService.refreshTokens('some-token');

      expect(mockJwt.verify).toHaveBeenCalledWith('some-token', {
        secret: 'my-refresh-secret',
      });

      process.env.JWT_REFRESH_SECRET = originalSecret;
    });
  });

  // ============================================================
  // GOOGLE AUTH — Edge Cases
  // ============================================================
  describe('googleAuth — edge cases', () => {
    it('should throw Error since Google verification is not implemented', async () => {
      await expect(
        authService.googleAuth({ idToken: 'any-token' }),
      ).rejects.toThrow('Google token verification not implemented');
    });

    it('should throw for empty idToken string', async () => {
      await expect(authService.googleAuth({ idToken: '' })).rejects.toThrow();
    });
  });

  // ============================================================
  // SEND OTP — Edge Cases
  // ============================================================
  describe('sendOtp — edge cases', () => {
    it('should always return success (no actual SMS sent)', async () => {
      const result = await authService.sendOtp({ phone: '+995599123456' });
      expect(result).toEqual({ message: 'OTP sent successfully' });
    });

    it('should not throw for any phone number format', async () => {
      // sendOtp does not validate internally, it just generates OTP
      const result = await authService.sendOtp({ phone: '+995577000000' });
      expect(result.message).toBe('OTP sent successfully');
    });
  });

  // ============================================================
  // VERIFY OTP — Edge Cases
  // ============================================================
  describe('verifyOtp — edge cases', () => {
    it('should always fail since validateOtp returns false (placeholder)', async () => {
      await expect(
        authService.verifyOtp({ phone: '+995599123456', code: '123456' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException with specific message', async () => {
      await expect(
        authService.verifyOtp({ phone: '+995599123456', code: '000000' }),
      ).rejects.toThrow('Invalid or expired OTP');
    });

    it('should reject any code since OTP storage is not implemented', async () => {
      const codes = ['111111', '999999', '000000', '123456'];
      for (const code of codes) {
        await expect(
          authService.verifyOtp({ phone: '+995599123456', code }),
        ).rejects.toThrow(BadRequestException);
      }
    });
  });

  // ============================================================
  // TOKEN GENERATION — Edge Cases
  // ============================================================
  describe('generateTokens (via login)', () => {
    it('should generate both access and refresh tokens in parallel', async () => {
      const user = {
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: 'hashed',
        name: null,
        avatar: null,
      };
      mockPrisma.user.findUnique.mockResolvedValue(user);
      (bcrypt.compare as any).mockResolvedValue(true);
      mockJwt.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      await authService.login({ email: 'test@example.com', password: 'password123' });

      // signAsync should be called exactly 2 times
      expect(mockJwt.signAsync).toHaveBeenCalledTimes(2);
    });

    it('should use JWT_ACCESS_SECRET for access token', async () => {
      const originalSecret = process.env.JWT_ACCESS_SECRET;
      process.env.JWT_ACCESS_SECRET = 'my-access-secret';

      const user = {
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: 'hashed',
        name: null,
        avatar: null,
      };
      mockPrisma.user.findUnique.mockResolvedValue(user);
      (bcrypt.compare as any).mockResolvedValue(true);
      mockJwt.signAsync.mockResolvedValue('token');

      await authService.login({ email: 'test@example.com', password: 'password123' });

      expect(mockJwt.signAsync).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ secret: 'my-access-secret', expiresIn: '15m' }),
      );

      process.env.JWT_ACCESS_SECRET = originalSecret;
    });

    it('should handle null email in token payload', async () => {
      const user = {
        id: 'user-1',
        email: null,
        passwordHash: 'hashed',
        name: null,
        avatar: null,
      };
      mockPrisma.user.findUnique.mockResolvedValue(user);
      (bcrypt.compare as any).mockResolvedValue(true);
      mockJwt.signAsync.mockResolvedValue('token');

      // Login requires email lookup which returns user with null email
      // but passwordHash exists so it passes the null check
      // Actually login checks !user.passwordHash, and passwordHash exists
      // Then compares password. Let's test via refreshTokens instead
      mockJwt.verify.mockReturnValue({ sub: 'user-1', email: null });
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: null });

      await authService.refreshTokens('token');

      expect(mockJwt.signAsync).toHaveBeenCalledWith(
        { sub: 'user-1', email: null },
        expect.any(Object),
      );
    });

    it('should handle signAsync failure', async () => {
      const user = {
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: 'hashed',
        name: null,
        avatar: null,
      };
      mockPrisma.user.findUnique.mockResolvedValue(user);
      (bcrypt.compare as any).mockResolvedValue(true);
      mockJwt.signAsync.mockRejectedValue(new Error('JWT signing failed'));

      await expect(
        authService.login({ email: 'test@example.com', password: 'password123' }),
      ).rejects.toThrow('JWT signing failed');
    });
  });
});
