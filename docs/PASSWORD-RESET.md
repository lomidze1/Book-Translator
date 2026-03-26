# Book Translator — პაროლის აღდგენა & Email ვერიფიკაცია

## სერვისის არჩევანი: Resend

**რატომ Resend:**
- სწრაფი setup, მინიმალური კონფიგურაცია
- 3,000 email/თვე უფასო tier
- React Email templates მხარდაჭერა
- მომავალში AWS SES-ზე მიგრაცია ~20 ხაზის ცვლილებით

**მომავალი მიგრაცია:** Resend → AWS SES (როცა AWS-ზე სრული deploy იქნება)

---

## 1. Prisma Schema ცვლილებები

### User მოდელში დასამატებელი ველები:
```prisma
model User {
  // ... არსებული ველები ...

  // Email verification
  emailVerificationToken   String?   @unique
  emailVerificationExpires DateTime?

  // Password reset
  passwordResetToken       String?   @unique
  passwordResetExpires     DateTime?
}
```

### მიგრაცია:
```bash
cd apps/api
npx prisma migrate dev --name add-password-reset-fields
```

---

## 2. ახალი NestJS მოდული: EmailModule

### ფაილების სტრუქტურა:
```
apps/api/src/email/
├── email.module.ts
├── email.service.ts
└── templates/
    ├── password-reset.ts      # პაროლის აღდგენის ტემპლეიტი
    └── email-verification.ts  # ემაილის დადასტურების ტემპლეიტი
```

### email.service.ts — ჩონჩხი:
```typescript
import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private resend: Resend;

  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  async sendPasswordResetEmail(to: string, token: string, name?: string): Promise<void> {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

    await this.resend.emails.send({
      from: process.env.EMAIL_FROM, // 'noreply@book-translator.ge'
      to,
      subject: 'პაროლის აღდგენა — Book Translator',
      html: this.getPasswordResetTemplate(resetUrl, name),
    });
  }

  async sendEmailVerification(to: string, token: string, name?: string): Promise<void> {
    const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;

    await this.resend.emails.send({
      from: process.env.EMAIL_FROM,
      to,
      subject: 'ემაილის დადასტურება — Book Translator',
      html: this.getEmailVerificationTemplate(verifyUrl, name),
    });
  }

  private getPasswordResetTemplate(resetUrl: string, name?: string): string {
    // HTML ტემპლეიტი
  }

  private getEmailVerificationTemplate(verifyUrl: string, name?: string): string {
    // HTML ტემპლეიტი
  }
}
```

---

## 3. Auth Service — დასამატებელი მეთოდები

### 3.1 forgotPassword()
```typescript
async forgotPassword(email: string): Promise<{ message: string }> {
  // 1. მომხმარებლის მოძებნა email-ით
  // 2. თუ არ არსებობს → მაინც დააბრუნე success (უსაფრთხოება — არ გაამჟღავნო)
  // 3. crypto.randomBytes(32) → hex token გენერაცია
  // 4. token-ის hash (SHA-256) შენახვა DB-ში + ვადის დაყენება (1 საათი)
  // 5. EmailService.sendPasswordResetEmail() გამოძახება
  // 6. { message: "Reset link sent to email" } დაბრუნება
}
```

**უსაფრთხოების წესები:**
- token DB-ში SHA-256 hash-ით ინახება (არა plain text)
- email არსებობა არ ამჟღავნდება (ყოველთვის success პასუხი)
- Rate limiting: 3 მოთხოვნა / 15 წუთი / email (Redis)

### 3.2 resetPassword()
```typescript
async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
  // 1. token-ის SHA-256 hash-ის გამოთვლა
  // 2. hash-ით მომხმარებლის მოძებნა DB-ში
  // 3. ვადის შემოწმება (passwordResetExpires > now)
  // 4. ახალი პაროლის bcrypt hash-ით შენახვა
  // 5. reset token ველების წაშლა DB-დან (null-ით)
  // 6. { message: "Password updated" } დაბრუნება
}
```

### 3.3 verifyEmail()
```typescript
async verifyEmail(token: string): Promise<{ message: string }> {
  // 1. token-ის hash-ით მომხმარებლის მოძებნა
  // 2. ვადის შემოწმება
  // 3. emailVerified = new Date() დაყენება
  // 4. token ველების გაწმენდა
  // 5. success პასუხი
}
```

### 3.4 register() — განახლება
არსებულ `register()` მეთოდში `// TODO: Send verification email` კომენტარის ნაცვლად:
```typescript
// Token გენერაცია
const verificationToken = crypto.randomBytes(32).toString('hex');
const hashedToken = crypto.createHash('sha256').update(verificationToken).digest('hex');

// DB-ში შენახვა
await this.prisma.user.update({
  where: { id: user.id },
  data: {
    emailVerificationToken: hashedToken,
    emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 საათი
  },
});

// Email გაგზავნა
await this.emailService.sendEmailVerification(dto.email, verificationToken, dto.name);
```

---

## 4. Auth Controller — ახალი Endpoints

### DTOs:
```typescript
// forgot-password.dto.ts
export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

// reset-password.dto.ts
export class ResetPasswordDto {
  @IsString()
  @MinLength(1)
  token: string;

  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain uppercase, lowercase, and number',
  })
  newPassword: string;
}

// verify-email.dto.ts
export class VerifyEmailDto {
  @IsString()
  token: string;
}
```

### Controller endpoints:
```typescript
@Post('forgot-password')
@Throttle({ default: { limit: 3, ttl: 900000 } }) // 3 req / 15 min
async forgotPassword(@Body() dto: ForgotPasswordDto) { ... }

@Post('reset-password')
async resetPassword(@Body() dto: ResetPasswordDto) { ... }

@Get('verify-email')
async verifyEmail(@Query() dto: VerifyEmailDto) { ... }
```

---

## 5. Frontend გვერდები (Next.js)

### 5.1 Forgot Password გვერდი
```
/[locale]/forgot-password
```
- Email-ის შეყვანის ფორმა
- "გაგზავნა" ღილაკი
- Success: "ლინკი გაიგზავნა თქვენს ემაილზე"
- i18n: ka + en თარგმანები

### 5.2 Reset Password გვერდი
```
/[locale]/reset-password?token=xxx
```
- ახალი პაროლის შეყვანა (2x — დადასტურება)
- პაროლის სირთულის ინდიკატორი
- Success: redirect → Login

### 5.3 Email Verification გვერდი
```
/[locale]/verify-email?token=xxx
```
- ავტომატური ვერიფიკაცია token-ით
- Success: "ემაილი დადასტურებულია" + redirect → Login
- Error: "ლინკი ვადაგასულია" + "ხელახლა გაგზავნა" ღილაკი

---

## 6. Environment Variables

```env
# .env-ში დასამატებელი
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM=noreply@book-translator.ge
FRONTEND_URL=http://localhost:3000
```

**Resend-ის setup:**
1. https://resend.com — ანგარიშის შექმნა
2. Domain-ის ვერიფიკაცია (DNS records)
3. API Key-ის გენერაცია
4. `.env`-ში ჩამატება

---

## 7. Token-ის უსაფრთხოების სტრატეგია

| პარამეტრი | Password Reset | Email Verification |
|---|---|---|
| **Token სიგრძე** | 32 bytes (hex) | 32 bytes (hex) |
| **შენახვის ფორმატი** | SHA-256 hash | SHA-256 hash |
| **ვადა** | 1 საათი | 24 საათი |
| **ერთჯერადი გამოყენება** | დიახ (გამოყენების შემდეგ იშლება) | დიახ |
| **Rate limit** | 3 req / 15 min / email | 3 req / 15 min / email |

### რატომ SHA-256 hash DB-ში (არა plain token):
თუ ბაზა გატეხეს, plain token-ებით თავდამსხმელს პაროლის შეცვლა შეეძლება. Hash-ით — არა.

---

## 8. იმპლემენტაციის თანმიმდევრობა

### ნაბიჯი 1: Infrastructure
- [ ] `pnpm add resend` (`apps/api`)
- [ ] `.env`-ში Resend credentials-ის დამატება
- [ ] Prisma schema-ს განახლება + მიგრაცია

### ნაბიჯი 2: EmailModule
- [ ] `EmailModule` + `EmailService` შექმნა
- [ ] HTML ტემპლეიტების დაწერა (ქართულ + ინგლისურ ენაზე)
- [ ] `EmailService`-ის ტესტირება (unit tests)

### ნაბიჯი 3: Password Reset Backend
- [ ] `ForgotPasswordDto` + `ResetPasswordDto` შექმნა
- [ ] `AuthService.forgotPassword()` იმპლემენტაცია
- [ ] `AuthService.resetPassword()` იმპლემენტაცია
- [ ] `AuthController`-ში endpoints-ების დამატება
- [ ] Rate limiting (Throttle)
- [ ] ტესტების დაწერა

### ნაბიჯი 4: Email Verification Backend
- [ ] `VerifyEmailDto` შექმნა
- [ ] `AuthService.verifyEmail()` იმპლემენტაცია
- [ ] `register()` მეთოდის განახლება (verification email-ის გაგზავნა)
- [ ] ტესტების დაწერა

### ნაბიჯი 5: Frontend
- [ ] `/forgot-password` გვერდის შექმნა
- [ ] `/reset-password` გვერდის შექმნა
- [ ] `/verify-email` გვერდის შექმნა
- [ ] i18n თარგმანების დამატება (`messages/ka.json`, `messages/en.json`)
- [ ] Login გვერდზე "პაროლი დაგავიწყდა?" ლინკის დამატება

### ნაბიჯი 6: ტესტირება
- [ ] Unit tests (AuthService, EmailService)
- [ ] Integration tests (full flow)
- [ ] Edge cases: expired token, invalid token, rate limiting, duplicate requests

---

## 9. ტესტების გეგმა

> **არსებული auth ტესტები:** ~221 ტესტი, 14 ფაილი
> **დასამატებელი:** ~95-105 ახალი ტესტი, 7 ახალი ფაილი

### ტესტ ფაილების სტრუქტურა (არსებული პატერნის მიხედვით):

```
apps/api/test/
├── auth/
│   ├── auth.service.password-reset.spec.ts      # ~25 ტესტი
│   ├── auth.service.email-verification.spec.ts  # ~20 ტესტი
│   ├── auth.controller.password-reset.spec.ts   # ~12 ტესტი
│   ├── dto-password-reset.spec.ts               # ~18 ტესტი
│   └── dto-password-reset-security.spec.ts      # ~12 ტესტი
├── email/
│   └── email.service.spec.ts                    # ~10 ტესტი
└── integration/
    └── password-reset-flow.spec.ts              # ~8 ტესტი
```

---

### 9.1 AuthService — Password Reset ტესტები (~25 ტესტი)
**ფაილი:** `test/auth/auth.service.password-reset.spec.ts`

```
describe('AuthService — forgotPassword')
  ✓ should generate token and send email for existing user
  ✓ should return success even if email does not exist (security)
  ✓ should hash token with SHA-256 before saving to DB
  ✓ should set passwordResetExpires to 1 hour from now
  ✓ should call EmailService.sendPasswordResetEmail with raw token
  ✓ should overwrite previous reset token if requested again
  ✓ should handle EmailService failure gracefully
  ✓ should handle DB error gracefully
  ✓ should work with Georgian email providers (mail.ge)
  ✓ should normalize email to lowercase

describe('AuthService — resetPassword')
  ✓ should reset password with valid token
  ✓ should hash the new password with bcrypt (salt 12)
  ✓ should clear reset token fields after successful reset
  ✓ should throw BadRequestException for expired token
  ✓ should throw BadRequestException for invalid/non-existent token
  ✓ should throw BadRequestException for already-used token (null in DB)
  ✓ should not reveal whether token existed (same error message)
  ✓ should handle concurrent reset attempts
  ✓ should reject if user has no passwordHash (Google OAuth only user)
  ✓ should handle DB update failure
  ✓ should correctly hash token before DB lookup
  ✓ should accept password with Georgian characters
  ✓ should reject password shorter than 8 characters
  ✓ should reject password without uppercase
  ✓ should reject password without digit
```

### 9.2 AuthService — Email Verification ტესტები (~20 ტესტი)
**ფაილი:** `test/auth/auth.service.email-verification.spec.ts`

```
describe('AuthService — register (updated)')
  ✓ should generate verification token on registration
  ✓ should save hashed token to DB
  ✓ should set emailVerificationExpires to 24 hours
  ✓ should call EmailService.sendEmailVerification
  ✓ should handle email sending failure (user still created)
  ✓ should still return userId and message

describe('AuthService — verifyEmail')
  ✓ should verify email with valid token
  ✓ should set emailVerified to current timestamp
  ✓ should clear verification token fields after success
  ✓ should throw BadRequestException for expired token (24h+)
  ✓ should throw BadRequestException for invalid token
  ✓ should return success if email already verified
  ✓ should handle DB failure gracefully
  ✓ should correctly SHA-256 hash token before lookup

describe('AuthService — resendVerificationEmail')
  ✓ should generate new token and send email
  ✓ should throw if email already verified
  ✓ should throw if user not found
  ✓ should respect rate limiting
  ✓ should invalidate previous token
  ✓ should work with Georgian name in email template
```

### 9.3 AuthController — Password Reset ტესტები (~12 ტესტი)
**ფაილი:** `test/auth/auth.controller.password-reset.spec.ts`

```
describe('AuthController — POST /auth/forgot-password')
  ✓ should delegate to AuthService.forgotPassword
  ✓ should return 200 with success message
  ✓ should propagate service errors
  ✓ should apply rate limiting (Throttle decorator)

describe('AuthController — POST /auth/reset-password')
  ✓ should delegate to AuthService.resetPassword
  ✓ should return 200 on success
  ✓ should return 400 for expired token
  ✓ should return 400 for invalid token
  ✓ should validate DTO (missing fields → 400)

describe('AuthController — GET /auth/verify-email')
  ✓ should delegate to AuthService.verifyEmail
  ✓ should return 200 on success
  ✓ should return 400 for invalid/expired token
```

### 9.4 DTO Validation ტესტები (~18 ტესტი)
**ფაილი:** `test/auth/dto-password-reset.spec.ts`

```
describe('ForgotPasswordDto')
  ✓ should accept valid email
  ✓ should reject invalid email format
  ✓ should reject empty email
  ✓ should accept Georgian email providers (user@mail.ge)
  ✓ should normalize email (trim whitespace)

describe('ResetPasswordDto')
  ✓ should accept valid token + password
  ✓ should reject empty token
  ✓ should reject password shorter than 8 chars
  ✓ should reject password longer than 128 chars
  ✓ should reject password without uppercase letter
  ✓ should reject password without lowercase letter
  ✓ should reject password without digit
  ✓ should accept password with special characters
  ✓ should accept password with Georgian characters

describe('VerifyEmailDto')
  ✓ should accept valid token string
  ✓ should reject empty token
  ✓ should reject non-string token
  ✓ should accept 64-char hex token
```

### 9.5 DTO Security ტესტები (~12 ტესტი)
**ფაილი:** `test/auth/dto-password-reset-security.spec.ts`

```
describe('Password Reset DTOs — Security')
  ✓ ForgotPasswordDto: should reject SQL injection in email
  ✓ ForgotPasswordDto: should reject XSS payload in email
  ✓ ResetPasswordDto: should handle extremely long token (DoS prevention)
  ✓ ResetPasswordDto: should handle null bytes in token
  ✓ ResetPasswordDto: should handle unicode normalization in password
  ✓ ResetPasswordDto: should reject token with whitespace injection
  ✓ VerifyEmailDto: should handle URL-encoded token
  ✓ VerifyEmailDto: should reject token with script injection
  ✓ Boundary: password exactly 8 characters (minimum)
  ✓ Boundary: password exactly 128 characters (maximum)
  ✓ Boundary: token exactly 64 hex characters
  ✓ Type coercion: numeric token should fail validation
```

### 9.6 EmailService ტესტები (~10 ტესტი)
**ფაილი:** `test/email/email.service.spec.ts`

```
describe('EmailService')
  ✓ should be defined
  ✓ should initialize Resend with API key from env

describe('EmailService — sendPasswordResetEmail')
  ✓ should call Resend with correct from/to/subject
  ✓ should include reset URL with token in email body
  ✓ should use FRONTEND_URL from env for reset link
  ✓ should handle Resend API error (throw/log)
  ✓ should include user name in template if provided

describe('EmailService — sendEmailVerification')
  ✓ should call Resend with correct from/to/subject
  ✓ should include verification URL with token
  ✓ should handle Resend API error
```

### 9.7 Integration ტესტები (~8 ტესტი)
**ფაილი:** `test/integration/password-reset-flow.spec.ts`

```
describe('Password Reset — Full Flow')
  ✓ Register → Verify Email → Login (happy path)
  ✓ Login → Forgot Password → Reset Password → Login with new password
  ✓ Forgot Password → Token expires → Reset fails
  ✓ Forgot Password → Request twice → Only latest token works
  ✓ Google OAuth user → Forgot Password → Appropriate error
  ✓ Register → Verify with invalid token → Fail → Resend → Verify
  ✓ Reset Password → Try login with old password → Fail
  ✓ Register without verification → Limited access check
```

---

### მოკინგის სტრატეგია (არსებული პატერნის შესაბამისად)

```typescript
// EmailService mock
const mockEmailService = {
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendEmailVerification: vi.fn().mockResolvedValue(undefined),
};

// crypto mock (token generation)
vi.mock('crypto', () => ({
  randomBytes: vi.fn(() => Buffer.from('a'.repeat(32))),
  createHash: vi.fn(() => ({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn(() => 'hashed_token_value'),
  })),
}));

// AuthService instantiation (direct, არა DI)
const service = new AuthService(
  mockPrisma as any,
  mockJwtService as any,
  mockRedisService as any,
  mockEmailService as any,  // ახალი dependency
);
```

---

### ტესტების შეჯამება

| ფაილი | ტესტების რაოდენობა | ტიპი |
|---|---|---|
| `auth.service.password-reset.spec.ts` | ~25 | Unit |
| `auth.service.email-verification.spec.ts` | ~20 | Unit |
| `auth.controller.password-reset.spec.ts` | ~12 | Unit |
| `dto-password-reset.spec.ts` | ~18 | Unit |
| `dto-password-reset-security.spec.ts` | ~12 | Security |
| `email.service.spec.ts` | ~10 | Unit |
| `password-reset-flow.spec.ts` | ~8 | Integration |
| **სულ** | **~105** | |

> **ტესტების შემდეგ სულ: ~221 (არსებული) + ~105 (ახალი) = ~326 auth ტესტი**

---

## 10. Edge Cases და Error Handling (ტესტებით დასაფარი)

| სცენარი | მოქმედება |
|---|---|
| Email არ არსებობს | დააბრუნე success (არ გაამჟღავნო) |
| Token ვადაგასულია | 400 "Token expired, please request a new one" |
| Token არასწორია | 400 "Invalid token" |
| User უკვე verified | 200 "Email already verified" |
| Google OAuth user-ს reset სთხოვს | 400 "Use Google to sign in" (არ აქვს password) |
| Rate limit exceeded | 429 "Too many requests, try again later" |
| პაროლი ძალიან მარტივია | 400 validation error (DTO-ში) |

---

## 11. მომავალი SES მიგრაციის გეგმა

როცა AWS-ზე deploy მოხდება, `EmailService`-ში მხოლოდ provider-ის ნაწილი იცვლება:

```typescript
// ახლა (Resend)
private resend = new Resend(process.env.RESEND_API_KEY);

// მომავალში (AWS SES)
private ses = new SESClient({ region: process.env.AWS_REGION });
```

`sendPasswordResetEmail()` და `sendEmailVerification()` მეთოდების ხელმოწერა არ იცვლება — მხოლოდ შიდა იმპლემენტაცია.
