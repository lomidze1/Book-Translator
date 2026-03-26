import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ForgotPasswordDto } from '../../src/auth/dto/forgot-password.dto';
import { ResetPasswordDto } from '../../src/auth/dto/reset-password.dto';
import { VerifyEmailDto } from '../../src/auth/dto/verify-email.dto';

describe('Password Reset & Email Verification DTOs', () => {
  // ============================================================
  // ForgotPasswordDto
  // ============================================================
  describe('ForgotPasswordDto', () => {
    it('should accept valid email', async () => {
      const dto = plainToInstance(ForgotPasswordDto, { email: 'user@example.com' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid email format', async () => {
      const dto = plainToInstance(ForgotPasswordDto, { email: 'not-an-email' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('email');
    });

    it('should reject empty email', async () => {
      const dto = plainToInstance(ForgotPasswordDto, { email: '' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept Georgian email providers (user@mail.ge)', async () => {
      const dto = plainToInstance(ForgotPasswordDto, { email: 'user@mail.ge' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject missing email field', async () => {
      const dto = plainToInstance(ForgotPasswordDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // ResetPasswordDto
  // ============================================================
  describe('ResetPasswordDto', () => {
    const validData = {
      token: 'a'.repeat(64),
      newPassword: 'SecurePass1',
    };

    it('should accept valid token + password', async () => {
      const dto = plainToInstance(ResetPasswordDto, validData);
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject empty token', async () => {
      const dto = plainToInstance(ResetPasswordDto, { ...validData, token: '' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject password shorter than 8 chars', async () => {
      const dto = plainToInstance(ResetPasswordDto, { ...validData, newPassword: 'Short1' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const passwordError = errors.find(e => e.property === 'newPassword');
      expect(passwordError).toBeDefined();
    });

    it('should reject password longer than 128 chars', async () => {
      const dto = plainToInstance(ResetPasswordDto, {
        ...validData,
        newPassword: 'A1' + 'a'.repeat(127),
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject password without uppercase letter', async () => {
      const dto = plainToInstance(ResetPasswordDto, { ...validData, newPassword: 'nouppercase1' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject password without digit', async () => {
      const dto = plainToInstance(ResetPasswordDto, { ...validData, newPassword: 'NoDigitHere' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept password with special characters', async () => {
      const dto = plainToInstance(ResetPasswordDto, { ...validData, newPassword: 'Secure@Pass1!' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept password with Georgian characters', async () => {
      const dto = plainToInstance(ResetPasswordDto, { ...validData, newPassword: 'პაროლიA1test' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept password exactly 8 characters (boundary)', async () => {
      const dto = plainToInstance(ResetPasswordDto, { ...validData, newPassword: 'Abcdef1x' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept password exactly 128 characters (boundary)', async () => {
      const dto = plainToInstance(ResetPasswordDto, {
        ...validData,
        newPassword: 'A1' + 'a'.repeat(126),
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  // ============================================================
  // VerifyEmailDto
  // ============================================================
  describe('VerifyEmailDto', () => {
    it('should accept valid token string', async () => {
      const dto = plainToInstance(VerifyEmailDto, { token: 'a'.repeat(64) });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject empty token', async () => {
      const dto = plainToInstance(VerifyEmailDto, { token: '' });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject missing token', async () => {
      const dto = plainToInstance(VerifyEmailDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept 64-char hex token', async () => {
      const dto = plainToInstance(VerifyEmailDto, { token: 'abcdef0123456789'.repeat(4) });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });
});
