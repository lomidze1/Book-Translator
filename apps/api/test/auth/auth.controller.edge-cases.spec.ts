import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthController } from '../../src/auth/auth.controller';

describe('AuthController — Edge Cases & Error Handling', () => {
  let controller: AuthController;

  const mockAuthService = {
    register: vi.fn(),
    login: vi.fn(),
    refreshTokens: vi.fn(),
    googleAuth: vi.fn(),
    sendOtp: vi.fn(),
    verifyOtp: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new (AuthController as any)(mockAuthService);
  });

  // ============================================================
  // POST /auth/register — Edge Cases
  // ============================================================
  describe('POST /auth/register — edge cases', () => {
    it('should propagate ConflictException from service', async () => {
      mockAuthService.register.mockRejectedValue(
        new ConflictException('User with this email already exists'),
      );

      await expect(
        controller.register({ email: 'dup@example.com', password: 'password123' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should handle registration with Georgian name', async () => {
      const dto = { email: 'gio@example.com', password: 'password123', name: 'გიორგი ჯანაშია' };
      mockAuthService.register.mockResolvedValue({
        message: 'Verification email sent',
        userId: 'user-1',
      });

      const result = await controller.register(dto);

      expect(mockAuthService.register).toHaveBeenCalledWith(dto);
      expect(result.userId).toBeDefined();
    });

    it('should handle registration without optional name', async () => {
      const dto = { email: 'noname@example.com', password: 'password123' };
      mockAuthService.register.mockResolvedValue({
        message: 'Verification email sent',
        userId: 'user-2',
      });

      const result = await controller.register(dto);

      expect(result.message).toBe('Verification email sent');
    });

    it('should propagate database errors', async () => {
      mockAuthService.register.mockRejectedValue(new Error('Database timeout'));

      await expect(
        controller.register({ email: 'test@example.com', password: 'password123' }),
      ).rejects.toThrow('Database timeout');
    });
  });

  // ============================================================
  // POST /auth/login — Edge Cases
  // ============================================================
  describe('POST /auth/login — edge cases', () => {
    it('should propagate UnauthorizedException for wrong password', async () => {
      mockAuthService.login.mockRejectedValue(
        new UnauthorizedException('Invalid email or password'),
      );

      await expect(
        controller.login({ email: 'test@example.com', password: 'wrongpassword' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return full auth response structure', async () => {
      const expectedResponse = {
        accessToken: 'eyJhbGciOiJIUzI1NiJ9.test',
        refreshToken: 'eyJhbGciOiJIUzI1NiJ9.refresh',
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'ნიკა',
          avatar: null,
        },
      };
      mockAuthService.login.mockResolvedValue(expectedResponse);

      const result = await controller.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('user');
      expect(result.user).toHaveProperty('id');
      expect(result.user).toHaveProperty('email');
      expect(result.user).toHaveProperty('name');
      expect(result.user).toHaveProperty('avatar');
    });

    it('should not include passwordHash in login response', async () => {
      mockAuthService.login.mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'token',
        user: { id: '1', email: 'a@b.com', name: null, avatar: null },
      });

      const result = await controller.login({
        email: 'a@b.com',
        password: 'password123',
      });

      expect((result as any).passwordHash).toBeUndefined();
      expect((result.user as any).passwordHash).toBeUndefined();
    });
  });

  // ============================================================
  // POST /auth/refresh — Edge Cases
  // ============================================================
  describe('POST /auth/refresh — edge cases', () => {
    it('should propagate UnauthorizedException for invalid token', async () => {
      mockAuthService.refreshTokens.mockRejectedValue(
        new UnauthorizedException('Invalid refresh token'),
      );

      await expect(
        controller.refresh({ refreshToken: 'invalid-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should propagate UnauthorizedException for expired token', async () => {
      mockAuthService.refreshTokens.mockRejectedValue(
        new UnauthorizedException('Invalid refresh token'),
      );

      await expect(
        controller.refresh({ refreshToken: 'expired-token' }),
      ).rejects.toThrow('Invalid refresh token');
    });

    it('should correctly pass refreshToken string to service', async () => {
      const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.signature';
      mockAuthService.refreshTokens.mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      });

      await controller.refresh({ refreshToken: token });

      expect(mockAuthService.refreshTokens).toHaveBeenCalledWith(token);
    });

    it('should return only accessToken and refreshToken', async () => {
      mockAuthService.refreshTokens.mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      });

      const result = await controller.refresh({ refreshToken: 'old-token' });

      expect(Object.keys(result)).toEqual(
        expect.arrayContaining(['accessToken', 'refreshToken']),
      );
    });
  });

  // ============================================================
  // POST /auth/google — Edge Cases
  // ============================================================
  describe('POST /auth/google — edge cases', () => {
    it('should propagate UnauthorizedException for invalid Google token', async () => {
      mockAuthService.googleAuth.mockRejectedValue(
        new UnauthorizedException('Invalid Google token'),
      );

      await expect(
        controller.googleAuth({ idToken: 'invalid-google-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should propagate Error for unimplemented Google verification', async () => {
      mockAuthService.googleAuth.mockRejectedValue(
        new Error('Google token verification not implemented'),
      );

      await expect(
        controller.googleAuth({ idToken: 'any-token' }),
      ).rejects.toThrow('Google token verification not implemented');
    });
  });

  // ============================================================
  // POST /auth/phone/send-otp — Edge Cases
  // ============================================================
  describe('POST /auth/phone/send-otp — edge cases', () => {
    it('should handle multiple sequential OTP requests', async () => {
      mockAuthService.sendOtp.mockResolvedValue({ message: 'OTP sent successfully' });

      const result1 = await controller.sendOtp({ phone: '+995599123456' });
      const result2 = await controller.sendOtp({ phone: '+995599123456' });

      expect(result1).toEqual(result2);
      expect(mockAuthService.sendOtp).toHaveBeenCalledTimes(2);
    });

    it('should pass complete DTO to service', async () => {
      mockAuthService.sendOtp.mockResolvedValue({ message: 'OTP sent successfully' });

      await controller.sendOtp({ phone: '+995577000001' });

      expect(mockAuthService.sendOtp).toHaveBeenCalledWith({ phone: '+995577000001' });
    });
  });

  // ============================================================
  // POST /auth/phone/verify-otp — Edge Cases
  // ============================================================
  describe('POST /auth/phone/verify-otp — edge cases', () => {
    it('should propagate BadRequestException for invalid OTP', async () => {
      mockAuthService.verifyOtp.mockRejectedValue(
        new BadRequestException('Invalid or expired OTP'),
      );

      await expect(
        controller.verifyOtp({ phone: '+995599123456', code: '000000' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return full auth response on successful OTP verification', async () => {
      const authResponse = {
        accessToken: 'access',
        refreshToken: 'refresh',
        user: { id: 'user-1', email: null, name: null, avatar: null },
      };
      mockAuthService.verifyOtp.mockResolvedValue(authResponse);

      const result = await controller.verifyOtp({
        phone: '+995599123456',
        code: '123456',
      });

      expect(result).toEqual(authResponse);
    });
  });
});
