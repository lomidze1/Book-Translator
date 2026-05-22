import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { AuthController } from '../../src/auth/auth.controller';

describe('AuthController — Password Reset & Email Verification', () => {
  let controller: AuthController;

  const mockAuthService = {
    register: vi.fn(),
    login: vi.fn(),
    refreshTokens: vi.fn(),
    googleAuth: vi.fn(),
    sendOtp: vi.fn(),
    verifyOtp: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    verifyEmail: vi.fn(),
    resendVerificationEmail: vi.fn(),
  };

  const mockConfig = { get: vi.fn().mockReturnValue('test') };

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new (AuthController as any)(mockAuthService, mockConfig);
  });

  // ============================================================
  // POST /auth/forgot-password
  // ============================================================
  describe('POST /auth/forgot-password', () => {
    it('should delegate to AuthService.forgotPassword', async () => {
      const dto = { email: 'user@example.com' };
      mockAuthService.forgotPassword.mockResolvedValue({ message: 'Reset link sent to email' });

      const result = await controller.forgotPassword(dto);

      expect(result).toEqual({ message: 'Reset link sent to email' });
      expect(mockAuthService.forgotPassword).toHaveBeenCalledWith('user@example.com');
    });

    it('should return 200 with success message', async () => {
      mockAuthService.forgotPassword.mockResolvedValue({ message: 'Reset link sent to email' });

      const result = await controller.forgotPassword({ email: 'test@test.com' });

      expect(result.message).toBe('Reset link sent to email');
    });

    it('should propagate service errors', async () => {
      mockAuthService.forgotPassword.mockRejectedValue(
        new BadRequestException('Too many requests'),
      );

      await expect(controller.forgotPassword({ email: 'test@test.com' })).rejects.toThrow(
        'Too many requests',
      );
    });
  });

  // ============================================================
  // POST /auth/reset-password
  // ============================================================
  describe('POST /auth/reset-password', () => {
    it('should delegate to AuthService.resetPassword', async () => {
      const dto = { token: 'abc123', newPassword: 'NewPass1' };
      mockAuthService.resetPassword.mockResolvedValue({ message: 'Password updated successfully' });

      const result = await controller.resetPassword(dto);

      expect(result).toEqual({ message: 'Password updated successfully' });
      expect(mockAuthService.resetPassword).toHaveBeenCalledWith('abc123', 'NewPass1');
    });

    it('should return 200 on success', async () => {
      mockAuthService.resetPassword.mockResolvedValue({ message: 'Password updated successfully' });

      const result = await controller.resetPassword({ token: 'tok', newPassword: 'Pass1234' });

      expect(result.message).toBe('Password updated successfully');
    });

    it('should return 400 for expired token', async () => {
      mockAuthService.resetPassword.mockRejectedValue(
        new BadRequestException('Invalid or expired reset token'),
      );

      await expect(
        controller.resetPassword({ token: 'expired', newPassword: 'Pass1234' }),
      ).rejects.toThrow('Invalid or expired reset token');
    });

    it('should return 400 for invalid token', async () => {
      mockAuthService.resetPassword.mockRejectedValue(
        new BadRequestException('Invalid or expired reset token'),
      );

      await expect(
        controller.resetPassword({ token: 'bad', newPassword: 'Pass1234' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ============================================================
  // GET /auth/verify-email
  // ============================================================
  describe('GET /auth/verify-email', () => {
    it('should delegate to AuthService.verifyEmail', async () => {
      const dto = { token: 'verify-token-123' };
      mockAuthService.verifyEmail.mockResolvedValue({ message: 'Email verified successfully' });

      const result = await controller.verifyEmail(dto);

      expect(result).toEqual({ message: 'Email verified successfully' });
      expect(mockAuthService.verifyEmail).toHaveBeenCalledWith('verify-token-123');
    });

    it('should return 200 on success', async () => {
      mockAuthService.verifyEmail.mockResolvedValue({ message: 'Email verified successfully' });

      const result = await controller.verifyEmail({ token: 'tok' });

      expect(result.message).toBe('Email verified successfully');
    });

    it('should return 400 for invalid/expired token', async () => {
      mockAuthService.verifyEmail.mockRejectedValue(
        new BadRequestException('Invalid or expired verification token'),
      );

      await expect(controller.verifyEmail({ token: 'bad' })).rejects.toThrow(BadRequestException);
    });
  });

  // ============================================================
  // POST /auth/resend-verification
  // ============================================================
  describe('POST /auth/resend-verification', () => {
    it('should delegate to AuthService.resendVerificationEmail', async () => {
      const dto = { email: 'user@example.com' };
      mockAuthService.resendVerificationEmail.mockResolvedValue({
        message: 'Verification email sent',
      });

      const result = await controller.resendVerification(dto);

      expect(result).toEqual({ message: 'Verification email sent' });
      expect(mockAuthService.resendVerificationEmail).toHaveBeenCalledWith('user@example.com');
    });

    it('should propagate errors', async () => {
      mockAuthService.resendVerificationEmail.mockRejectedValue(
        new BadRequestException('Email is already verified'),
      );

      await expect(
        controller.resendVerification({ email: 'verified@test.com' }),
      ).rejects.toThrow('Email is already verified');
    });
  });
});
