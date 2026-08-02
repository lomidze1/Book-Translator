# Book Translator — CLAUDE.md

## პროექტის აღწერა
Book Translator არის ონლაინ წიგნების თარგმნის პლატფორმა. Monorepo აგებულია pnpm + Turbo-ზე.

## პროექტის სტრუქტურა
```
Book-Translator/
├── apps/
│   ├── api/              # NestJS backend API
│   │   ├── src/
│   │   │   ├── auth/         # Auth (JWT, Google OAuth, OTP, password reset/change)
│   │   │   ├── users/        # Users (profile CRUD)
│   │   │   ├── books/        # Books (search, upload, CRUD)
│   │   │   ├── translation/  # AI Translation (BullMQ processor, Claude API)
│   │   │   ├── tts/          # Text-to-Speech (Google Cloud, ElevenLabs, Azure)
│   │   │   ├── payment/      # Payment (BOG Pay, TBC Pay)
│   │   │   ├── reader/       # Reader (bookmarks, highlights, notes, progress)
│   │   │   ├── notification/ # Notifications (email, push, in-app, WebSocket)
│   │   │   ├── email/        # Email service (Resend)
│   │   │   ├── parsing/      # File parsing (PDF, EPUB, DOCX, TXT)
│   │   │   ├── s3/           # AWS S3 service (file storage)
│   │   │   ├── prisma/       # Prisma service
│   │   │   ├── redis/        # Redis service (OTP, rate limiting)
│   │   │   └── common/       # Shared guards, decorators, pipes
│   │   ├── test/         # Vitest tests (700+)
│   │   └── prisma/       # Prisma schema + migrations
│   ├── web/              # Next.js 15 frontend (SCSS)
│   │   ├── src/app/      # Pages (see below)
│   │   ├── src/components/  # Navbar, Footer, NotificationBell, PaymentModal, etc.
│   │   └── src/styles/   # SCSS variables, mixins
│   └── mobile/           # React Native (Expo)
├── packages/
│   ├── config/           # ESLint, Prettier, TSConfig
│   ├── shared/           # Shared types & interfaces
│   └── reader/           # Online Reader shared logic
├── docs/                 # დოკუმენტაცია
├── docker-compose.yml    # PostgreSQL 16 + Redis 7
└── .claude/
    └── agents/           # 7 აგენტი (test-guardian, code-reviewer, etc.)
```

### Frontend გვერდები
```
/{locale}/                     # Landing page
/{locale}/login                # Login (email + Google OAuth)
/{locale}/register             # Registration
/{locale}/search               # Book search
/{locale}/upload               # File upload (drag & drop)
/{locale}/books/:id            # Book detail + translation options
/{locale}/books/:id/read       # Online Reader
/{locale}/books/:id/preview    # უფასო ნიმუში (ENABLE_PREVIEW)
/{locale}/forgot-password      # Forgot password
/{locale}/reset-password       # Reset password (token)
/{locale}/verify-email         # Email verification
/{locale}/confirm-password-change  # Password change confirmation
/{locale}/dashboard            # User dashboard
/{locale}/library              # User library
/{locale}/profile              # User profile
/{locale}/profile/change-password  # Change password
/{locale}/profile/translations # Translation history
/{locale}/profile/favorites    # Favorites
/{locale}/profile/payments     # Payment history
/{locale}/settings             # Notification + reader settings
/{locale}/payment/success      # Payment success
/{locale}/payment/failure      # Payment failure
/{locale}/payment/mock         # Mock payment (dev only)
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

### SEO Auditor (`seo-auditor`)
SEO ოპტიმიზაციის მცველი. Meta tags, structured data (JSON-LD), hreflang, sitemap, robots.txt.

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
- **Backend:** NestJS + Prisma + PostgreSQL 16
- **Frontend:** Next.js 15 + React 19 + SCSS + next-intl (i18n)
- **Auth:** JWT + Google OAuth (google-auth-library) + OTP (Redis)
- **AI Translation:** Claude API (@anthropic-ai/sdk) + BullMQ
- **TTS:** Google Cloud TTS + ElevenLabs + Azure + BullMQ
- **Payments:** BOG Pay + TBC Pay
- **Notifications:** Web Push (VAPID) + Socket.IO + Resend (email)
- **Database:** PostgreSQL 16 (Docker) + Redis 7 (Docker)
- **Storage:** AWS S3
- **Monitoring:** Sentry
- **Testing:** Vitest (700+ tests)
- **Validation:** class-validator + class-transformer
- **Language:** TypeScript strict mode

## კოდის სტილი
- TypeScript strict mode
- NestJS conventions (modules, services, controllers, DTOs, guards)
- SCSS modules for styling (არა TailwindCSS)
- Prisma for database access
- ტესტებში direct instantiation (NestJS DI-ს გვერდის ავლა)
- vi.fn() და vi.mock() მოკინგისთვის
- ქართული unicode სიმბოლოების მხარდაჭერა

## i18n (ინტერნაციონალიზაცია)
- **ბიბლიოთეკა:** next-intl
- **ენები:** ქართული (ka, default), ინგლისური (en)
- **თარგმანის ფაილები:** `apps/web/messages/{ka,en}.json`
- **Routing:** `[locale]` dynamic segment (`/ka/search`, `/en/search`)
- **ენის გადართვა:** LanguageSwitcher კომპონენტი Navbar-ში

## ბრანჩები
- **main** — სტაბილური ვერსია
- **dev** — აქტიური განვითარება
