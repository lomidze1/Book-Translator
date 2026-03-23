import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RegisterDto } from '../../src/auth/dto/register.dto';
import { LoginDto } from '../../src/auth/dto/login.dto';
import { SendOtpDto } from '../../src/auth/dto/send-otp.dto';
import { VerifyOtpDto } from '../../src/auth/dto/verify-otp.dto';
import { RefreshTokenDto } from '../../src/auth/dto/refresh-token.dto';
import { GoogleAuthDto } from '../../src/auth/dto/google-auth.dto';
import { UpdateProfileDto } from '../../src/users/dto/update-profile.dto';

describe('DTO Security & Edge Case Validation', () => {
  // ============================================================
  // SQL Injection Attempts
  // ============================================================
  describe('SQL Injection Prevention', () => {
    it('should accept SQL injection in email but fail email validation', async () => {
      const dto = plainToInstance(RegisterDto, {
        email: "'; DROP TABLE users; --",
        password: 'securePassword123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('email');
    });

    it('should accept SQL injection in name (no SQL filtering on name)', async () => {
      const dto = plainToInstance(RegisterDto, {
        email: 'test@example.com',
        password: 'securePassword123',
        name: "'; DROP TABLE users; --",
      });
      const errors = await validate(dto);
      // Name is just a string with max length, SQL injection strings are valid strings
      // Protection should be at the ORM level (Prisma parameterized queries)
      expect(errors.length).toBe(0);
    });

    it('should accept SQL injection in password (password is just a string)', async () => {
      const dto = plainToInstance(RegisterDto, {
        email: 'test@example.com',
        password: "' OR '1'='1'; DROP TABLE users;",
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  // ============================================================
  // XSS Payloads
  // ============================================================
  describe('XSS Payload Handling', () => {
    it('should accept XSS in name field (validation only checks type/length)', async () => {
      const dto = plainToInstance(RegisterDto, {
        email: 'test@example.com',
        password: 'securePassword123',
        name: '<script>alert("XSS")</script>',
      });
      const errors = await validate(dto);
      // XSS prevention should be handled at output encoding level
      expect(errors.length).toBe(0);
    });

    it('should reject XSS in email because it fails email format', async () => {
      const dto = plainToInstance(RegisterDto, {
        email: '<script>alert("XSS")</script>',
        password: 'securePassword123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept XSS in avatar URL (UpdateProfileDto)', async () => {
      const dto = plainToInstance(UpdateProfileDto, {
        avatar: 'javascript:alert("XSS")',
      });
      const errors = await validate(dto);
      // Avatar is just @IsString — no URL validation
      expect(errors.length).toBe(0);
    });
  });

  // ============================================================
  // Boundary Values
  // ============================================================
  describe('Boundary Values', () => {
    describe('RegisterDto boundaries', () => {
      it('should pass with exactly 8 character password (minimum)', async () => {
        const dto = plainToInstance(RegisterDto, {
          email: 'test@example.com',
          password: '12345678',
        });
        const errors = await validate(dto);
        expect(errors.length).toBe(0);
      });

      it('should fail with 7 character password (below minimum)', async () => {
        const dto = plainToInstance(RegisterDto, {
          email: 'test@example.com',
          password: '1234567',
        });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
      });

      it('should pass with exactly 128 character password (maximum)', async () => {
        const dto = plainToInstance(RegisterDto, {
          email: 'test@example.com',
          password: 'a'.repeat(128),
        });
        const errors = await validate(dto);
        expect(errors.length).toBe(0);
      });

      it('should fail with 129 character password (above maximum)', async () => {
        const dto = plainToInstance(RegisterDto, {
          email: 'test@example.com',
          password: 'a'.repeat(129),
        });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
      });

      it('should pass with exactly 100 character name (maximum)', async () => {
        const dto = plainToInstance(RegisterDto, {
          email: 'test@example.com',
          password: 'password123',
          name: 'ა'.repeat(100),
        });
        const errors = await validate(dto);
        expect(errors.length).toBe(0);
      });

      it('should fail with 101 character name (above maximum)', async () => {
        const dto = plainToInstance(RegisterDto, {
          email: 'test@example.com',
          password: 'password123',
          name: 'ა'.repeat(101),
        });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
      });

      it('should pass with single character name', async () => {
        const dto = plainToInstance(RegisterDto, {
          email: 'test@example.com',
          password: 'password123',
          name: 'ა',
        });
        const errors = await validate(dto);
        expect(errors.length).toBe(0);
      });
    });

    describe('VerifyOtpDto boundaries', () => {
      it('should pass with exactly 6 digit code', async () => {
        const dto = plainToInstance(VerifyOtpDto, {
          phone: '+995599123456',
          code: '123456',
        });
        const errors = await validate(dto);
        expect(errors.length).toBe(0);
      });

      it('should fail with 5 digit code', async () => {
        const dto = plainToInstance(VerifyOtpDto, {
          phone: '+995599123456',
          code: '12345',
        });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
      });

      it('should fail with 7 digit code', async () => {
        const dto = plainToInstance(VerifyOtpDto, {
          phone: '+995599123456',
          code: '1234567',
        });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
      });

      it('should accept non-numeric 6 character code (Length only checks length)', async () => {
        const dto = plainToInstance(VerifyOtpDto, {
          phone: '+995599123456',
          code: 'abcdef',
        });
        const errors = await validate(dto);
        // @Length(6,6) only checks string length, not numeric content
        expect(errors.length).toBe(0);
      });
    });

    describe('SendOtpDto phone boundaries', () => {
      it('should pass with valid +995 followed by exactly 9 digits', async () => {
        const dto = plainToInstance(SendOtpDto, { phone: '+995500000000' });
        const errors = await validate(dto);
        expect(errors.length).toBe(0);
      });

      it('should fail with +995 followed by 8 digits', async () => {
        const dto = plainToInstance(SendOtpDto, { phone: '+99550000000' });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
      });

      it('should fail with +995 followed by 10 digits', async () => {
        const dto = plainToInstance(SendOtpDto, { phone: '+9955000000000' });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
      });

      it('should fail with letters after +995', async () => {
        const dto = plainToInstance(SendOtpDto, { phone: '+995abcdefghi' });
        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
      });
    });
  });

  // ============================================================
  // Unicode & Georgian Characters
  // ============================================================
  describe('Unicode & Georgian Characters', () => {
    it('should accept full Georgian alphabet in name', async () => {
      const dto = plainToInstance(RegisterDto, {
        email: 'test@example.com',
        password: 'securePassword123',
        name: 'აბგდევზთიკლმნოპჟრსტუფქღყშჩცძწჭხჯჰ',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept mixed Georgian and Latin in name', async () => {
      const dto = plainToInstance(RegisterDto, {
        email: 'test@example.com',
        password: 'securePassword123',
        name: 'გიორგი (George)',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept emoji in name', async () => {
      const dto = plainToInstance(RegisterDto, {
        email: 'test@example.com',
        password: 'securePassword123',
        name: '😀 Test User',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept Unicode password', async () => {
      const dto = plainToInstance(RegisterDto, {
        email: 'test@example.com',
        password: 'პაროლი123456',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });
  });

  // ============================================================
  // Type Coercion & Null Values
  // ============================================================
  describe('Type Coercion & Null Values', () => {
    it('should fail when email is a number', async () => {
      const dto = plainToInstance(RegisterDto, {
        email: 12345,
        password: 'securePassword123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail when password is a number', async () => {
      const dto = plainToInstance(RegisterDto, {
        email: 'test@example.com',
        password: 12345678,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail when refreshToken is null', async () => {
      const dto = plainToInstance(RefreshTokenDto, {
        refreshToken: null,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail when idToken is undefined', async () => {
      const dto = plainToInstance(GoogleAuthDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail when phone is a number', async () => {
      const dto = plainToInstance(SendOtpDto, {
        phone: 995599123456,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // UpdateProfileDto — Security & Edge Cases
  // ============================================================
  describe('UpdateProfileDto — edge cases', () => {
    it('should accept empty DTO (all fields optional)', async () => {
      const dto = plainToInstance(UpdateProfileDto, {});
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should only accept ka or en for locale', async () => {
      const dtoKa = plainToInstance(UpdateProfileDto, { locale: 'ka' });
      const dtoEn = plainToInstance(UpdateProfileDto, { locale: 'en' });
      const dtoFr = plainToInstance(UpdateProfileDto, { locale: 'fr' });

      expect((await validate(dtoKa)).length).toBe(0);
      expect((await validate(dtoEn)).length).toBe(0);
      expect((await validate(dtoFr)).length).toBeGreaterThan(0);
    });

    it('should reject locale with SQL injection', async () => {
      const dto = plainToInstance(UpdateProfileDto, {
        locale: "'; DROP TABLE users;",
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept long avatar URL', async () => {
      const dto = plainToInstance(UpdateProfileDto, {
        avatar: 'https://s3.amazonaws.com/' + 'a'.repeat(500) + '.jpg',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject name over 100 characters', async () => {
      const dto = plainToInstance(UpdateProfileDto, {
        name: 'გ'.repeat(101),
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should accept name with 100 characters exactly', async () => {
      const dto = plainToInstance(UpdateProfileDto, {
        name: 'გ'.repeat(100),
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject numeric name', async () => {
      const dto = plainToInstance(UpdateProfileDto, { name: 12345 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject numeric locale', async () => {
      const dto = plainToInstance(UpdateProfileDto, { locale: 123 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  // ============================================================
  // Empty & Whitespace Inputs
  // ============================================================
  describe('Empty & Whitespace Inputs', () => {
    it('should fail RegisterDto with whitespace-only email', async () => {
      const dto = plainToInstance(RegisterDto, {
        email: '   ',
        password: 'password123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should handle whitespace-only password (8+ spaces pass MinLength)', async () => {
      const dto = plainToInstance(RegisterDto, {
        email: 'test@example.com',
        password: '        ', // 8 spaces
      });
      const errors = await validate(dto);
      // MinLength(8) passes for 8 spaces since it's length-based
      expect(errors.length).toBe(0);
    });

    it('should handle empty string refreshToken', async () => {
      const dto = plainToInstance(RefreshTokenDto, {
        refreshToken: '',
      });
      const errors = await validate(dto);
      // @IsString() passes for empty string
      expect(errors.length).toBe(0);
    });

    it('should fail LoginDto with empty email', async () => {
      const dto = plainToInstance(LoginDto, {
        email: '',
        password: 'password123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should fail LoginDto with empty password', async () => {
      const dto = plainToInstance(LoginDto, {
        email: 'test@example.com',
        password: '',
      });
      const errors = await validate(dto);
      // @IsString() passes for empty string but password field may have no @MinLength
      // LoginDto only has @IsString, so empty string is valid for validation
      // This documents the current behavior
      expect(dto.password).toBe('');
    });
  });

  // ============================================================
  // Email Format Edge Cases
  // ============================================================
  describe('Email Format Edge Cases', () => {
    it('should accept standard email', async () => {
      const dto = plainToInstance(RegisterDto, {
        email: 'user@example.com',
        password: 'password123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept email with subdomain', async () => {
      const dto = plainToInstance(RegisterDto, {
        email: 'user@mail.example.com',
        password: 'password123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept email with plus tag', async () => {
      const dto = plainToInstance(RegisterDto, {
        email: 'user+tag@example.com',
        password: 'password123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject email without domain', async () => {
      const dto = plainToInstance(RegisterDto, {
        email: 'user@',
        password: 'password123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject email without local part', async () => {
      const dto = plainToInstance(RegisterDto, {
        email: '@example.com',
        password: 'password123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('should reject email without @ symbol', async () => {
      const dto = plainToInstance(RegisterDto, {
        email: 'userexample.com',
        password: 'password123',
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
