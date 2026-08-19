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

  const mockConfig = { get: vi.fn().mockReturnValue('test') };

  function createMockRes() {
    return { cookie: vi.fn(), clearCookie: vi.fn() } as any;
  }
  function createMockReq(cookies: Record<string, string> = {}) {
    return { cookies, headers: {}, body: {} } as any;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new (AuthController as any)(mockAuthService, mockConfig);
  });

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

  describe('POST /auth/login — edge cases', () => {
    it('should propagate UnauthorizedException for wrong password', async () => {
      mockAuthService.login.mockRejectedValue(
        new UnauthorizedException('Invalid email or password'),
      );

      await expect(
        controller.login({ email: 'test@example.com', password: 'wrongpassword' }, createMockReq(), createMockRes()),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return access token and user (refresh token goes to cookie)', async () => {
      mockAuthService.login.mockResolvedValue({
        accessToken: 'eyJhbGciOiJIUzI1NiJ9.test',
        refreshToken: 'eyJhbGciOiJIUzI1NiJ9.refresh',
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'ნიკა',
          avatar: null,
        },
      });
      const res = createMockRes();

      const result = await controller.login(
        { email: 'test@example.com', password: 'password123' },
        createMockReq(),
        res,
      );

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('user');
      expect((result as any).refreshToken).toBeUndefined();
      expect(res.cookie).toHaveBeenCalled();
    });

    it('should not include passwordHash in login response', async () => {
      mockAuthService.login.mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'token',
        user: { id: '1', email: 'a@b.com', name: null, avatar: null },
      });

      const result = await controller.login(
        { email: 'a@b.com', password: 'password123' },
        createMockReq(),
        createMockRes(),
      );

      expect((result as any).passwordHash).toBeUndefined();
      expect((result.user as any).passwordHash).toBeUndefined();
    });
  });

  describe('POST /auth/refresh — edge cases', () => {
    it('should propagate UnauthorizedException for invalid token', async () => {
      mockAuthService.refreshTokens.mockRejectedValue(
        new UnauthorizedException('Invalid refresh token'),
      );

      await expect(
        controller.refresh(createMockReq({ refresh_token: 'invalid-token' }), createMockRes()),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should propagate UnauthorizedException for expired token', async () => {
      mockAuthService.refreshTokens.mockRejectedValue(
        new UnauthorizedException('Invalid refresh token'),
      );

      await expect(
        controller.refresh(createMockReq({ refresh_token: 'expired-token' }), createMockRes()),
      ).rejects.toThrow('Invalid refresh token');
    });

    it('should correctly pass refresh cookie value to service', async () => {
      const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.signature';
      mockAuthService.refreshTokens.mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      });

      await controller.refresh(createMockReq({ refresh_token: token }), createMockRes());

      expect(mockAuthService.refreshTokens).toHaveBeenCalledWith(token);
    });

    it('should return access token only (refresh stays in cookie)', async () => {
      mockAuthService.refreshTokens.mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      });

      const result = await controller.refresh(
        createMockReq({ refresh_token: 'old-token' }),
        createMockRes(),
      );

      expect(result).toEqual({ accessToken: 'new-access' });
    });

    it('rejects when cookie is missing', async () => {
      await expect(
        controller.refresh(createMockReq({}), createMockRes()),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('POST /auth/google — edge cases', () => {
    it('should propagate UnauthorizedException for invalid Google token', async () => {
      mockAuthService.googleAuth.mockRejectedValue(
        new UnauthorizedException('Invalid Google token'),
      );

      await expect(
        controller.googleAuth({ idToken: 'invalid-google-token' }, createMockReq(), createMockRes()),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should propagate Error for unimplemented Google verification', async () => {
      mockAuthService.googleAuth.mockRejectedValue(
        new Error('Google token verification not implemented'),
      );

      await expect(
        controller.googleAuth({ idToken: 'any-token' }, createMockReq(), createMockRes()),
      ).rejects.toThrow('Google token verification not implemented');
    });
  });

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

  describe('POST /auth/phone/verify-otp — edge cases', () => {
    it('should propagate BadRequestException for invalid OTP', async () => {
      mockAuthService.verifyOtp.mockRejectedValue(
        new BadRequestException('Invalid or expired OTP'),
      );

      await expect(
        controller.verifyOtp({ phone: '+995599123456', code: '000000' }, createMockRes()),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return access token + user (refresh token goes to cookie)', async () => {
      mockAuthService.verifyOtp.mockResolvedValue({
        accessToken: 'access',
        refreshToken: 'refresh',
        user: { id: 'user-1', email: null, name: null, avatar: null },
      });
      const res = createMockRes();

      const result = await controller.verifyOtp(
        { phone: '+995599123456', code: '123456' },
        res,
      );

      expect(result).toEqual({
        accessToken: 'access',
        user: { id: 'user-1', email: null, name: null, avatar: null },
      });
      expect((result as any).refreshToken).toBeUndefined();
      expect(res.cookie).toHaveBeenCalled();
    });
  });
});
