import { describe, it, expect, vi, beforeEach } from 'vitest';
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

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new (AuthController as any)(mockAuthService);
  });

  // ============================================================
  // POST /auth/register
  // ============================================================
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

  // ============================================================
  // POST /auth/login
  // ============================================================
  describe('POST /auth/login', () => {
    it('should call authService.login and return tokens + user', async () => {
      const dto = { email: 'test@example.com', password: 'password123' };
      const expectedResult = {
        accessToken: 'access-123',
        refreshToken: 'refresh-123',
        user: { id: 'user-1', email: dto.email, name: 'გიორგი', avatar: null },
      };
      mockAuthService.login.mockResolvedValue(expectedResult);

      const result = await controller.login(dto);

      expect(result).toEqual(expectedResult);
      expect(mockAuthService.login).toHaveBeenCalledWith(dto);
    });

    it('should propagate UnauthorizedException from service', async () => {
      const dto = { email: 'test@example.com', password: 'wrong' };
      mockAuthService.login.mockRejectedValue(new Error('Invalid email or password'));

      await expect(controller.login(dto)).rejects.toThrow('Invalid email or password');
    });
  });

  // ============================================================
  // POST /auth/refresh
  // ============================================================
  describe('POST /auth/refresh', () => {
    it('should call authService.refreshTokens with the refresh token', async () => {
      const dto = { refreshToken: 'old-refresh-token' };
      const expectedResult = {
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
      };
      mockAuthService.refreshTokens.mockResolvedValue(expectedResult);

      const result = await controller.refresh(dto);

      expect(result).toEqual(expectedResult);
      expect(mockAuthService.refreshTokens).toHaveBeenCalledWith(dto.refreshToken);
    });
  });

  // ============================================================
  // POST /auth/google
  // ============================================================
  describe('POST /auth/google', () => {
    it('should call authService.googleAuth with the Google ID token', async () => {
      const dto = { idToken: 'google-token-123' };
      const expectedResult = {
        accessToken: 'access',
        refreshToken: 'refresh',
        user: { id: 'user-1', email: 'user@gmail.com', name: 'User', avatar: null },
      };
      mockAuthService.googleAuth.mockResolvedValue(expectedResult);

      const result = await controller.googleAuth(dto);

      expect(result).toEqual(expectedResult);
      expect(mockAuthService.googleAuth).toHaveBeenCalledWith(dto);
    });
  });

  // ============================================================
  // POST /auth/phone/send-otp
  // ============================================================
  describe('POST /auth/phone/send-otp', () => {
    it('should call authService.sendOtp with phone number', async () => {
      const dto = { phone: '+995599123456' };
      mockAuthService.sendOtp.mockResolvedValue({ message: 'OTP sent successfully' });

      const result = await controller.sendOtp(dto);

      expect(result).toEqual({ message: 'OTP sent successfully' });
      expect(mockAuthService.sendOtp).toHaveBeenCalledWith(dto);
    });
  });

  // ============================================================
  // POST /auth/phone/verify-otp
  // ============================================================
  describe('POST /auth/phone/verify-otp', () => {
    it('should call authService.verifyOtp with phone and code', async () => {
      const dto = { phone: '+995599123456', code: '123456' };
      const expectedResult = {
        accessToken: 'access',
        refreshToken: 'refresh',
        user: { id: 'user-1', email: null, name: null, avatar: null },
      };
      mockAuthService.verifyOtp.mockResolvedValue(expectedResult);

      const result = await controller.verifyOtp(dto);

      expect(result).toEqual(expectedResult);
      expect(mockAuthService.verifyOtp).toHaveBeenCalledWith(dto);
    });
  });
});
