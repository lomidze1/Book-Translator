import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from '../../src/auth/auth.controller';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    register: vi.fn(),
    login: vi.fn(),
    refreshTokens: vi.fn(),
    googleAuth: vi.fn(),
    sendOtp: vi.fn(),
    verifyOtp: vi.fn(),
  };

  // ConfigService stub — `production` to keep cookieOptions test-stable.
  const mockConfig = { get: vi.fn().mockReturnValue('test') };

  // Builds a minimal Response stand-in capturing cookie operations.
  function createMockRes() {
    const cookies: Record<string, { value: string; opts?: unknown }> = {};
    const cleared: string[] = [];
    return {
      cookies,
      cleared,
      cookie: vi.fn((name: string, value: string, opts?: unknown) => {
        cookies[name] = { value, opts };
      }),
      clearCookie: vi.fn((name: string) => {
        cleared.push(name);
      }),
    } as any;
  }

  function createMockReq(cookies: Record<string, string> = {}) {
    return { cookies } as any;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new (AuthController as any)(mockAuthService, mockConfig);
  });

  describe('POST /auth/register', () => {
    it('should call authService.register with the DTO', async () => {
      const dto = { email: 'test@example.com', password: 'password123', name: 'გიორგი' };
      const expectedResult = { message: 'Verification email sent', userId: 'user-123' };
      mockAuthService.register.mockResolvedValue(expectedResult);

      const result = await controller.register(dto);

      expect(result).toEqual(expectedResult);
      expect(mockAuthService.register).toHaveBeenCalledWith(dto);
    });

    it('should propagate errors from service', async () => {
      const dto = { email: 'existing@example.com', password: 'password123' };
      mockAuthService.register.mockRejectedValue(
        new Error('User with this email already exists'),
      );

      await expect(controller.register(dto)).rejects.toThrow(
        'User with this email already exists',
      );
    });
  });

  describe('POST /auth/login', () => {
    it('sets refresh cookie and returns access token + user (no refresh in body)', async () => {
      const dto = { email: 'test@example.com', password: 'password123' };
      mockAuthService.login.mockResolvedValue({
        accessToken: 'access-123',
        refreshToken: 'refresh-123',
        user: { id: 'user-1', email: dto.email, name: 'გიორგი', avatar: null },
      });
      const res = createMockRes();

      const result = await controller.login(dto, res);

      expect(result).toEqual({
        accessToken: 'access-123',
        user: { id: 'user-1', email: dto.email, name: 'გიორგი', avatar: null },
      });
      // Refresh token must not leak through the response body
      expect((result as any).refreshToken).toBeUndefined();
      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'refresh-123',
        expect.objectContaining({ httpOnly: true, path: '/api/auth' }),
      );
    });

    it('should propagate UnauthorizedException from service', async () => {
      const dto = { email: 'test@example.com', password: 'wrong' };
      mockAuthService.login.mockRejectedValue(new Error('Invalid email or password'));
      const res = createMockRes();

      await expect(controller.login(dto, res)).rejects.toThrow('Invalid email or password');
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/refresh', () => {
    it('reads refresh token from cookie and sets a new cookie', async () => {
      mockAuthService.refreshTokens.mockResolvedValue({
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      });
      const req = createMockReq({ refresh_token: 'old-refresh' });
      const res = createMockRes();

      const result = await controller.refresh(req, res);

      expect(result).toEqual({ accessToken: 'new-access' });
      expect(mockAuthService.refreshTokens).toHaveBeenCalledWith('old-refresh');
      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'new-refresh',
        expect.objectContaining({ httpOnly: true }),
      );
    });

    it('throws when refresh cookie is missing', async () => {
      const req = createMockReq({});
      const res = createMockRes();

      await expect(controller.refresh(req, res)).rejects.toThrow(UnauthorizedException);
      expect(mockAuthService.refreshTokens).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/logout', () => {
    it('clears the refresh cookie', async () => {
      const res = createMockRes();

      const result = await controller.logout(res);

      expect(result).toEqual({ success: true });
      expect(res.clearCookie).toHaveBeenCalledWith('refresh_token', expect.any(Object));
    });
  });

  describe('POST /auth/google', () => {
    it('sets refresh cookie and strips refresh token from body', async () => {
      const dto = { idToken: 'google-token-123' };
      mockAuthService.googleAuth.mockResolvedValue({
        accessToken: 'access',
        refreshToken: 'refresh',
        user: { id: 'user-1', email: 'user@gmail.com', name: 'User', avatar: null },
      });
      const res = createMockRes();

      const result = await controller.googleAuth(dto, res);

      expect(result).toEqual({
        accessToken: 'access',
        user: { id: 'user-1', email: 'user@gmail.com', name: 'User', avatar: null },
      });
      expect((result as any).refreshToken).toBeUndefined();
      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'refresh',
        expect.objectContaining({ httpOnly: true }),
      );
    });
  });

  describe('POST /auth/phone/send-otp', () => {
    it('should call authService.sendOtp with phone number', async () => {
      const dto = { phone: '+995599123456' };
      mockAuthService.sendOtp.mockResolvedValue({ message: 'OTP sent successfully' });

      const result = await controller.sendOtp(dto);

      expect(result).toEqual({ message: 'OTP sent successfully' });
      expect(mockAuthService.sendOtp).toHaveBeenCalledWith(dto);
    });
  });

  describe('POST /auth/phone/verify-otp', () => {
    it('sets refresh cookie and strips refresh token from body', async () => {
      const dto = { phone: '+995599123456', code: '123456' };
      mockAuthService.verifyOtp.mockResolvedValue({
        accessToken: 'access',
        refreshToken: 'refresh',
        user: { id: 'user-1', email: null, name: null, avatar: null },
      });
      const res = createMockRes();

      const result = await controller.verifyOtp(dto, res);

      expect(result).toEqual({
        accessToken: 'access',
        user: { id: 'user-1', email: null, name: null, avatar: null },
      });
      expect((result as any).refreshToken).toBeUndefined();
      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'refresh',
        expect.any(Object),
      );
    });
  });
});
