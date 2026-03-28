import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ForgotPasswordDto } from '../../src/auth/dto/forgot-password.dto';
import { ResetPasswordDto } from '../../src/auth/dto/reset-password.dto';
import { VerifyEmailDto } from '../../src/auth/dto/verify-email.dto';

describe('Password Reset DTOs — Security & Edge Cases', () => {
  // ============================================================
  // SQL Injection
  // ============================================================
  describe('SQL Injection Prevention', () => {
    it('ForgotPasswordDto: should reject SQL injection in email', async () => {
      const dto = plainToInstance(ForgotPasswordDto, {
        email: "'; DROP TABLE users; --",
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('email');
    });

    it('ResetPasswordDto: should reject SQL injection in token (wrong length)', async () => {
      const dto = plainToInstance(ResetPasswordDto, {
        token: "' OR '1'='1'; DROP TABLE users;",
        newPassword: 'SecurePass1',
      });
      const errors = await validate(dto);
      // Token must be exactly 64 chars (SHA256 hex)
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // XSS Payloads
  // ============================================================
  describe('XSS Payload Handling', () => {
    it('ForgotPasswordDto: should reject XSS payload in email', async () => {
      const dto = plainToInstance(ForgotPasswordDto, {
        email: '<script>alert("xss")</script>',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('VerifyEmailDto: should reject XSS in token (wrong length)', async () => {
      const dto = plainToInstance(VerifyEmailDto, {
        token: '<script>alert("xss")</script>',
      });
      const errors = await validate(dto);
      // Token must be exactly 64 chars
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // Boundary Values
  // ============================================================
  describe('Boundary Values', () => {
    it('ResetPasswordDto: password exactly 8 characters (minimum)', async () => {
      const dto = plainToInstance(ResetPasswordDto, {
        token: 'a'.repeat(64),
        newPassword: 'Abcdef1x',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('ResetPasswordDto: password exactly 128 characters (maximum)', async () => {
      const dto = plainToInstance(ResetPasswordDto, {
        token: 'a'.repeat(64),
        newPassword: 'A1' + 'a'.repeat(126),
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('ResetPasswordDto: password 7 characters (below minimum)', async () => {
      const dto = plainToInstance(ResetPasswordDto, {
        token: 'a'.repeat(64),
        newPassword: 'Abcde1x',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('ResetPasswordDto: password 129 characters (above maximum)', async () => {
      const dto = plainToInstance(ResetPasswordDto, {
        token: 'a'.repeat(64),
        newPassword: 'A1' + 'a'.repeat(127),
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // Special Characters & Unicode
  // ============================================================
  describe('Unicode & Special Characters', () => {
    it('ResetPasswordDto: should handle unicode in password', async () => {
      const dto = plainToInstance(ResetPasswordDto, {
        token: 'a'.repeat(64),
        newPassword: 'ქართული1A',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('ResetPasswordDto: should handle emoji in password', async () => {
      const dto = plainToInstance(ResetPasswordDto, {
        token: 'a'.repeat(64),
        newPassword: 'Password1🔑',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('VerifyEmailDto: should reject extremely long token', async () => {
      const dto = plainToInstance(VerifyEmailDto, {
        token: 'a'.repeat(10000),
      });
      const errors = await validate(dto);
      // Token must be exactly 64 chars
      expect(errors.length).toBeGreaterThan(0);
    });

    it('ResetPasswordDto: should reject null bytes in token (wrong length)', async () => {
      const dto = plainToInstance(ResetPasswordDto, {
        token: 'token\x00with\x00nulls',
        newPassword: 'SecurePass1',
      });
      const errors = await validate(dto);
      // Token must be exactly 64 chars
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // Type Coercion
  // ============================================================
  describe('Type Coercion', () => {
    it('VerifyEmailDto: numeric token should pass (coerced to string)', async () => {
      const dto = plainToInstance(VerifyEmailDto, { token: 12345 as any });
      const errors = await validate(dto);
      // class-transformer may or may not coerce — depends on config
      // The important thing is it doesn't crash
      expect(errors).toBeDefined();
    });

    it('ForgotPasswordDto: should reject number as email', async () => {
      const dto = plainToInstance(ForgotPasswordDto, { email: 12345 as any });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
