# Book Translator — არქიტექტურა

## მონორეპოს სტრუქტურა

პროექტი ორგანიზებულია **მონორეპოში** (Turborepo):

```
book-translator/
├── apps/
│   ├── web/                    # Next.js 15 ვებ აპლიკაცია
│   ├── mobile/                 # React Native მობილური აპლიკაცია (Expo)
│   └── api/                    # NestJS Backend API სერვერი
├── packages/
│   ├── reader/                 # Online Reader (გაზიარებული web/mobile-ს შორის)
│   ├── shared/                 # გაზიარებული ტიპები, ინტერფეისები
│   └── config/                 # ESLint, TypeScript, Prettier კონფიგურაცია
├── turbo.json
├── package.json
└── docs/
```

## სისტემის არქიტექტურა (High-Level)

```
┌─────────────────────────────────────────────────────┐
│                    კლიენტები                         │
│  ┌──────────────┐    ┌──────────────────┐           │
│  │   Web App    │    │   Mobile App     │           │
│  │  (Next.js)   │    │ (React Native)   │           │
│  └──────┬───────┘    └────────┬─────────┘           │
└─────────┼─────────────────────┼─────────────────────┘
          │                     │
          ▼                     ▼
┌─────────────────────────────────────────────────────┐
│                   NestJS API                         │
│                                                      │
│  Auth │ Books │ Translation │ TTS │ Payment │ Reader │
│  Email │ Notification │ S3 │ Parsing │ Prisma │ Redis │
│                                                      │
│  BullMQ Workers: Translation, TTS, Notification      │
│  WebSocket: Socket.IO (progress, notifications)      │
└──────┬──────────┬──────────┬──────────┬──────────────┘
       │          │          │          │
       ▼          ▼          ▼          ▼
┌──────────┐ ┌─────────┐ ┌─────────┐ ┌──────────────┐
│PostgreSQL│ │  Redis   │ │  AWS S3 │ │ External APIs│
│(Database)│ │(Queue/   │ │(Files)  │ │Claude, Google│
│          │ │ Cache)   │ │         │ │TTS, BOG, TBC │
└──────────┘ └─────────┘ └─────────┘ └──────────────┘
```

## კომპონენტების აღწერა

### 1. Web App (`apps/web`) — Next.js

ძირითადი ვებ აპლიკაცია:
- რეგისტრაცია/ავტორიზაცია (Email, Google OAuth)
- წიგნების ძებნა და ატვირთვა
- გადახდა (BOG/TBC)
- ნათარგმნი წიგნების კითხვა (Online Reader)
- ხმოვანი წაკითხვა (TTS)
- ბიბლიოთეკა და Dashboard
- ნოტიფიკაციები (in-app, push)

**ტექნიკური დეტალები:**
- Next.js 15 (App Router)
- React 19
- SCSS (Sass modules)
- next-intl — i18n (ქართული + ინგლისური, `[locale]` routing)
- Socket.io-client — რეალ-ტაიმ პროგრესი და ნოტიფიკაციები
- @react-oauth/google — Google Sign-In

### 2. Mobile App (`apps/mobile`) — React Native

მობილური აპლიკაცია iOS და Android-ისთვის:
- წიგნების კითხვა და ბიბლიოთეკა
- სანიშნეები და პროგრესის სინქრონიზაცია
- ხმოვანი წაკითხვა (Background playback)
- Push ნოტიფიკაციები

**ტექნიკური დეტალები:**
- React Native 0.76+
- Expo (managed workflow)
- Expo Router

### 3. API Server (`apps/api`) — NestJS

ცენტრალური Backend სერვერი. ყველა მოდული, მათ შორის Translation და TTS workers, ერთ პროცესში ეშვება BullMQ-ით:

| მოდული | პასუხისმგებლობა |
|---|---|
| **Auth** | რეგისტრაცია, ლოგინი, JWT, Google OAuth, OTP, პაროლის აღდგენა/შეცვლა |
| **Email** | Resend ინტეგრაცია, ვერიფიკაცია, reset, confirmation emails |
| **Users** | მომხმარებლის პროფილი |
| **Books** | წიგნების ძებნა (Google Books + Open Library), ატვირთვა, CRUD |
| **Translation** | BullMQ processor, Claude API თარგმანი, პროგრესის ტრეკინგი |
| **TTS** | BullMQ processor, Google Cloud/ElevenLabs/Azure TTS, აუდიო S3-ზე |
| **Payment** | Flitt ინტეგრაცია, webhook callbacks |
| **Reader** | სანიშნეები, ხაზგასმები, შენიშვნები, კითხვის პროგრესი |
| **Notification** | Email/Push/In-app, WebSocket gateway, BullMQ queue |
| **Parsing** | PDF, EPUB, DOCX, TXT ფაილების დამუშავება |
| **S3** | AWS S3 ფაილების მენეჯმენტი (upload, presigned URLs) |
| **Prisma** | Database client |
| **Redis** | Cache, rate limiting, OTP storage |
| **Common** | Guards, decorators, pipes |

---

## მონაცემთა ნაკადი (Data Flow)

### წიგნის ძებნა
```
მომხმარებელი → Web → API → Google Books + Open Library + DB → შედეგები
```

### წიგნის თარგმნა
```
ატვირთვა → API → S3 (ფაილი) → Payment (გადახდა) → BullMQ Queue
  → Translation Processor → Claude API (თავ-თავად)
  → Socket.io (პროგრესი → მომხმარებელი)
  → DB + S3 (შედეგი) → ნოტიფიკაცია
```

### ნოტიფიკაციის ნაკადი
```
თარგმანი/გადახდა/TTS დასრულდა
  → NotificationService.notify()
  → 1. DB ჩანაწერი + WebSocket (მყისიერი in-app)
  → 2. BullMQ Queue → Email (Resend) + Push (VAPID)
```

## უსაფრთხოება

- **JWT + Refresh Tokens** — ავტორიზაცია (token version invalidation)
- **Rate Limiting** — Redis-based per-endpoint + global Throttler
- **Brute-force protection** — 10 login attempts / 15 min
- **ფაილის ვალიდაცია** — extension, MIME, magic bytes verification
- **CORS** — მხოლოდ ნებადართული დომენებიდან
- **Helmet.js** — HTTP headers უსაფრთხოება
- **გადახდის ვალიდაცია** — Webhook signature verification (BOG/TBC)
- **S3 Presigned URLs** — დროში შეზღუდული ლინკები
- **Bcrypt** — password hashing (12 rounds)
- **Timing-safe comparison** — email enumeration prevention

## Docker (Development)

```yaml
# docker-compose up -d
services:
  postgres:  # PostgreSQL 16 — port 5432
  redis:     # Redis 7 — port 6379
```

## გაზიარებული პაკეტები (packages/)

| პაკეტი | აღწერა |
|---|---|
| `packages/reader` | Online Reader კომპონენტი (web/mobile) |
