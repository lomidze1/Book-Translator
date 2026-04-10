# Book Translator — ტექნოლოგიური სტეკი

## მონორეპო ინფრასტრუქტურა

| ინსტრუმენტი | დანიშნულება |
|---|---|
| **Turborepo** | მონორეპო მართვა, ბილდის ოპტიმიზაცია, caching |
| **pnpm** | პაკეტების მენეჯერი (სწრაფი, disk-efficient) |
| **TypeScript** | ყველა პაკეტში ტიპების უსაფრთხოება |

---

## Frontend — ვებ აპლიკაცია (`apps/web`)

| ტექნოლოგია | დანიშნულება | რატომ |
|---|---|---|
| **Next.js 15** | React Framework (App Router) | SSR, SEO, მაღალი პერფორმანსი |
| **React 19** | UI ბიბლიოთეკა | კომპონენტების არქიტექტურა |
| **SCSS (Sass)** | სტილიზაცია | CSS modules, variables, mixins |
| **next-intl** | ინტერნაციონალიზაცია | ქართული და ინგლისური UI |
| **Socket.io-client** | WebSocket | რეალ-ტაიმ პროგრესი და ნოტიფიკაციები |
| **@react-oauth/google** | Google OAuth | Google Sign-In frontend |

---

## Frontend — მობილური აპლიკაცია (`apps/mobile`)

| ტექნოლოგია | დანიშნულება | რატომ |
|---|---|---|
| **React Native 0.76+** | მობილური framework | iOS + Android ერთი codebase |
| **Expo** | React Native toolkit | მარტივი build, OTA updates |
| **Expo Router** | ნავიგაცია | file-based routing |

---

## Backend — API სერვერი (`apps/api`)

| ტექნოლოგია | დანიშნულება | რატომ |
|---|---|---|
| **NestJS 10+** | Backend Framework | მოდულური, scalable, TypeScript-native |
| **Prisma** | ORM | type-safe DB queries, მარტივი მიგრაციები |
| **PostgreSQL 16** | მონაცემთა ბაზა | რელაციური, საიმედო, JSON მხარდაჭერა |
| **Redis 7** | Cache + Queue | BullMQ, rate limiting, OTP storage |
| **BullMQ** | Job Queue | თარგმნის, TTS, ნოტიფიკაციის async processing |
| **Socket.io** | WebSocket სერვერი | რეალ-ტაიმ პროგრესი და ნოტიფიკაციები |
| **google-auth-library** | Google OAuth | ID token verification |
| **Multer** | ფაილის ატვირთვა | multipart/form-data |
| **class-validator** | ვალიდაცია | DTO ვალიდაცია |
| **Helmet** | უსაფრთხოება | HTTP headers |
| **@nestjs/throttler** | Rate Limiting | API-ს დაცვა |
| **Sentry** | Error tracking | production monitoring |

---

## AI თარგმანი (Translation Module)

| ტექნოლოგია | დანიშნულება | რატომ |
|---|---|---|
| **@anthropic-ai/sdk** | Claude API | ძირითადი AI თარგმანი |
| **pdf-parse** | PDF → ტექსტი | PDF ფაილების დამუშავება |
| **epub2** | EPUB → თავები | EPUB ფაილების დამუშავება |
| **mammoth** | DOCX → HTML/ტექსტი | Word ფაილების დამუშავება |
| **BullMQ** | Job processing | Queue-დან სამუშაოების აღება |

### რატომ Claude API?

1. **დიდი კონტექსტის ფანჯარა (200K tokens)** — მთელი თავი ერთდროულად
2. **ქართული ენის ხარისხი** — კარგი ქართული ენის მხარდაჭერა
3. **კონტექსტუალური თარგმანი** — ესმის ნარატივი, პერსონაჟები, მეტაფორები
4. **თანმიმდევრულობა** — system prompt-ით პერსონაჟების სახელების, ტერმინების თანმიმდევრულობა

### თარგმანის ოპტიმიზაცია

- **Context window management** — წინა თავის რეზიუმე შემდეგ თავის prompt-ში
- **Glossary** — პერსონაჟების სახელების და ტერმინების ლექსიკონი
- **Chunking** — დიდი თავები 8K-char ფრაგმენტებად
- **Retry logic** — exponential backoff, 3 attempts (BullMQ)

---

## TTS — ხმოვანი წაკითხვა (TTS Module)

| ტექნოლოგია | დანიშნულება | რატომ |
|---|---|---|
| **Google Cloud TTS (Neural2)** | ძირითადი TTS API | საუკეთესო ქართული ხმები |
| **ElevenLabs** | ინგლისური TTS | მაღალხარისხიანი ბუნებრივი ხმები |
| **Azure Cognitive Services** | სარეზერვო TTS | დამატებითი ენების მხარდაჭერა |
| **fluent-ffmpeg** | აუდიო processing | ფრაგმენტების შეერთება MP3-ად |
| **BullMQ** | Job processing | აუდიო გენერაციის async queue |

### Provider Fallback სისტემა
- ავტომატური health check-ები
- provider failure → fallback სხვა provider-ზე
- ენის მიხედვით provider-ის არჩევა (ქართული → Google Cloud)

### ვებ აუდიო პლეიერი
- **HTML5 Audio API** — ბრაუზერის ნეიტივი playback
- **Media Session API** — OS-level controls, keyboard media keys

---

## Notification System

| ტექნოლოგია | დანიშნულება | რატომ |
|---|---|---|
| **web-push** | Web Push API (VAPID) | W3C სტანდარტი, უფასო |
| **BullMQ** | Async dispatch | არ ანელებს ძირითად flow-ს |
| **Socket.io** | In-app real-time | მყისიერი WebSocket შეტყობინებები |
| **Resend** | Email templates | ტრანზაქციული emails (KA/EN) |
| **Service Worker** | Push handlers | Browser push notifications |

---

## გარე სერვისები და API-ები

| სერვისი | დანიშნულება |
|---|---|
| **Claude API (Anthropic)** | AI წიგნის თარგმანი |
| **Google Cloud TTS** | ქართული ხმოვანი წაკითხვა |
| **Google Books API** | წიგნების ძებნა, მეტადატა |
| **Open Library API** | დამატებითი წიგნების ინფო |
| **BOG Pay API** | საქართველოს ბანკის გადახდა |
| **TBC Pay API** | თიბისის გადახდა |
| **Resend** | ტრანზაქციული Email |
| **Google OAuth** | სოციალური ავტორიზაცია |
| **Sentry** | Error tracking |
| **AWS S3** | ფაილების შენახვა |

---

## ინფრასტრუქტურა და DevOps

| ტექნოლოგია | დანიშნულება |
|---|---|
| **AWS S3** | ფაილების შენახვა (წიგნები, აუდიო, თარგმანები) |
| **Vercel** | Web App hosting (Next.js) |
| **Railway** | API + DB + Redis hosting |
| **Docker** | Development environment |
| **GitHub Actions** | CI/CD (lint, test, build) |

### Docker (Development)

| სერვისი | Image | Port |
|---|---|---|
| **PostgreSQL 16** | postgres:16-alpine | 5432 |
| **Redis 7** | redis:7-alpine | 6379 |

---

## განვითარების ინსტრუმენტები

| ინსტრუმენტი | დანიშნულება |
|---|---|
| **ESLint** | კოდის ხარისხი |
| **Prettier** | კოდის ფორმატირება |
| **Vitest** | Unit/Integration ტესტები (700+) |
| **Husky** | Git hooks (pre-commit) |
| **lint-staged** | staged ფაილების linting |
