# Book Translator — CLAUDE.md

## პროექტის აღწერა
Book Translator არის ონლაინ წიგნების თარგმნის პლატფორმა. Monorepo აგებულია pnpm + Turbo-ზე.

## პროექტის სტრუქტურა
```
Book-Translator/
├── apps/
│   ├── api/              # NestJS backend API
│   │   ├── src/
│   │   │   ├── auth/     # Auth module (JWT, Google OAuth, OTP)
│   │   │   ├── users/    # Users module (profile CRUD)
│   │   │   ├── prisma/   # Prisma service
│   │   │   └── redis/    # Redis service (OTP, rate limiting)
│   │   ├── test/         # Vitest tests (280+)
│   │   └── prisma/       # Prisma schema + migrations
│   └── web/              # Next.js 15 frontend (SCSS)
│       ├── src/app/      # Pages (landing, login, register)
│       ├── src/components/  # Navbar, Footer
│       └── src/styles/   # SCSS variables, mixins
├── packages/
│   ├── config/           # ESLint, Prettier, TSConfig
│   └── shared/           # Shared types & interfaces
├── docs/                 # დოკუმენტაცია (7 ფაილი)
├── docker-compose.yml    # PostgreSQL 16 + Redis 7
└── .claude/
    └── agents/
        └── test-guardian.md   # ტესტირების აგენტი
```

## ხელმისაწვდომი აგენტები

### Test Guardian (`test-guardian`)
ტესტირების ექსპერტი. Edge cases, security tests, coverage, DTO validation.

### Code Reviewer (`code-reviewer`)
კოდის ხარისხის მცველი. DRY, SOLID, NestJS best practices, TypeScript strictness.

### Prisma Guardian (`prisma-guardian`)
ბაზის მცველი. Schema validation, index analysis, migration safety, docs sync.

### Security Auditor (`security-auditor`)
უსაფრთხოების აუდიტორი. Auth bypass, input sanitization, secrets, OWASP Top 10.

### Doc Sync (`doc-sync`)
დოკუმენტაციის სინქრონიზატორი. კოდის ცვლილებები → docs/ განახლება.

### API Builder (`api-builder`)
Module გენერატორი. ერთი ბრძანებით: module + service + controller + DTOs + tests.

## ხელმისაწვდომი სკილები (commands/)

| სკილი | ბრძანება | აღწერა |
|---|---|---|
| **nest-module** | `/nest-module <name>` | NestJS module scaffolding |
| **pre-commit-check** | `/pre-commit-check` | Commit-ის წინ ვალიდაცია |
| **phase-checker** | `/phase-checker [N]` | ROADMAP ფაზის პროგრესი |
| **api-test-gen** | `/api-test-gen <file>` | ტესტების ავტო-გენერაცია |

## ძირითადი ბრძანებები

```bash
# Dependencies
pnpm install

# Docker (PostgreSQL + Redis)
docker-compose up -d
docker-compose down

# Prisma
cd apps/api && npx prisma migrate dev
cd apps/api && npx prisma studio

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
- **Frontend:** Next.js 15 + React 19 + SCSS
- **Auth:** JWT + Passport.js + Google OAuth (google-auth-library) + OTP (Redis)
- **Database:** PostgreSQL 16 (Docker) + Redis 7 (Docker)
- **Testing:** Vitest (280+ tests)
- **Validation:** class-validator + class-transformer
- **Language:** TypeScript

## კოდის სტილი
- TypeScript strict mode
- NestJS conventions (modules, services, controllers, DTOs, guards)
- SCSS modules for styling (არა TailwindCSS)
- Prisma for database access
- ტესტებში direct instantiation (NestJS DI-ს გვერდის ავლა)
- vi.fn() და vi.mock() მოკინგისთვის
- ქართული unicode სიმბოლოების მხარდაჭერა

## ბრანჩები
- **main** — სტაბილური ვერსია
- **test** — აქტიური განვითარება (ფაზა 1 დასრულებული)
