# Book Translator — CLAUDE.md

## პროექტის აღწერა
Book Translator არის ონლაინ წიგნების თარგმნის პლატფორმა. Monorepo აგებულია pnpm + Turbo-ზე.

## პროექტის სტრუქტურა
```
Book-Translator/
├── apps/
│   └── api/          # NestJS backend API
├── packages/         # Shared packages
├── docs/             # დოკუმენტაცია
└── .claude/
    └── agents/
        └── test-guardian.md   # ტესტირების აგენტი
```

## ხელმისაწვდომი აგენტები

### Test Guardian (`test-guardian`)
ტესტირების ექსპერტი აგენტი. გამოიყენე კოდის ტესტირებისთვის:
- Edge case ტესტები
- Security ტესტები
- Coverage ანალიზი
- DTO ვალიდაცია
- Integration ტესტები

## ძირითადი ბრძანებები

```bash
# Dependencies
pnpm install

# API ტესტები
cd apps/api && npx vitest run

# API ტესტები coverage-ით
cd apps/api && npx vitest run --coverage

# Turbo build
pnpm turbo build
```

## ტექნოლოგიური სტეკი
- **Monorepo:** pnpm workspaces + Turborepo
- **Backend:** NestJS + Prisma + PostgreSQL
- **Auth:** JWT + Passport.js + Google OAuth + OTP
- **Testing:** Vitest
- **Validation:** class-validator + class-transformer
- **Language:** TypeScript

## კოდის სტილი
- TypeScript strict mode
- NestJS conventions (modules, services, controllers, DTOs, guards)
- Prisma for database access
- ტესტებში direct instantiation (NestJS DI-ს გვერდის ავლა)
- vi.fn() და vi.mock() მოკინგისთვის
- ქართული unicode სიმბოლოების მხარდაჭერა
