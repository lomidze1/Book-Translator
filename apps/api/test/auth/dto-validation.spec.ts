import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RegisterDto } from '../../src/auth/dto/register.dto';
import { LoginDto } from '../../src/auth/dto/login.dto';
import { SendOtpDto } from '../../src/auth/dto/send-otp.dto';
import { VerifyOtpDto } from '../../src/auth/dto/verify-otp.dto';
import { RefreshTokenDto } from '../../src/auth/dto/refresh-token.dto';
import { GoogleAuthDto } from '../../src/auth/dto/google-auth.dto';

describe('Auth DTOs Validation', () => {
  // ============================================================
  // RegisterDto
  // ============================================================
  describe('RegisterDto', () => {
    it('should pass validation with valid data', async () => {
      const dto = plainToInstance(RegisterDto, {
        email: 'test@example.com',
        password: 'securePassword123',
        name: 'გიორგი',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass validation without optional name', async () => {
      const dto = plainToInstance(RegisterDto, {
        email: 'test@example.com',
        password: 'securePassword123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail with invalid email', async () => {
      const dto = plainToInstance(RegisterDto, {
        email: 'not-an-email',
        password: 'securePassword123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('email');
    });

    it('should fail with empty email', async () => {
      const dto = plainToInstance(RegisterDto, {
        email: '',
        password: 'securePassword123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with password shorter than 8 characters', async () => {
      const dto = plainToInstance(RegisterDto, {
        email: 'test@example.com',
        password: 'short',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('password');
    });

    it('should fail with password longer than 128 characters', async () => {
      const dto = plainToInstance(RegisterDto, {
        email: 'test@example.com',
        password: 'a'.repeat(129),
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with name longer than 100 characters', async () => {
      const dto = plainToInstance(RegisterDto, {
        email: 'test@example.com',
        password: 'securePassword123',
        name: 'a'.repeat(101),
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // LoginDto
  // ============================================================
  describe('LoginDto', () => {
    it('should pass validation with valid data', async () => {
      const dto = plainToInstance(LoginDto, {
        email: 'test@example.com',
        password: 'password123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail with invalid email', async () => {
      const dto = plainToInstance(LoginDto, {
        email: 'invalid',
        password: 'password123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail without password', async () => {
      const dto = plainToInstance(LoginDto, {
        email: 'test@example.com',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // SendOtpDto
  // ============================================================
  describe('SendOtpDto', () => {
    it('should pass with valid Georgian phone number', async () => {
      const dto = plainToInstance(SendOtpDto, {
        phone: '+995599123456',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail with non-Georgian phone number', async () => {
      const dto = plainToInstance(SendOtpDto, {
        phone: '+1234567890',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with phone number without +995 prefix', async () => {
      const dto = plainToInstance(SendOtpDto, {
        phone: '599123456',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with too short Georgian number', async () => {
      const dto = plainToInstance(SendOtpDto, {
        phone: '+99559912',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with too long Georgian number', async () => {
      const dto = plainToInstance(SendOtpDto, {
        phone: '+9955991234567',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // VerifyOtpDto
  // ============================================================
  describe('VerifyOtpDto', () => {
    it('should pass with valid phone and 6-digit code', async () => {
      const dto = plainToInstance(VerifyOtpDto, {
        phone: '+995599123456',
        code: '123456',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail with code shorter than 6 digits', async () => {
      const dto = plainToInstance(VerifyOtpDto, {
        phone: '+995599123456',
        code: '12345',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with code longer than 6 digits', async () => {
      const dto = plainToInstance(VerifyOtpDto, {
        phone: '+995599123456',
        code: '1234567',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail with invalid phone number', async () => {
      const dto = plainToInstance(VerifyOtpDto, {
        phone: 'invalid',
        code: '123456',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // RefreshTokenDto
  // ============================================================
  describe('RefreshTokenDto', () => {
    it('should pass with valid refresh token', async () => {
      const dto = plainToInstance(RefreshTokenDto, {
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail without refreshToken', async () => {
      const dto = plainToInstance(RefreshTokenDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // GoogleAuthDto
  // ============================================================
  describe('GoogleAuthDto', () => {
    it('should pass with valid ID token', async () => {
      const dto = plainToInstance(GoogleAuthDto, {
        idToken: 'google-id-token-string',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail without idToken', async () => {
      const dto = plainToInstance(GoogleAuthDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
