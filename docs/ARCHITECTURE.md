# Book Translator — არქიტექტურა

## მონორეპოს სტრუქტურა

პროექტი ორგანიზებულია **მონორეპოში** (Turborepo) და შედგება 5 ძირითადი პაკეტისგან:

```
book-translator/
├── apps/
│   ├── web/                    # Next.js ვებ აპლიკაცია
│   ├── mobile/                 # React Native მობილური აპლიკაცია
│   ├── api/                    # NestJS Backend API სერვერი
│   ├── translator/             # თარგმნის მიკროსერვისი (Node.js Worker)
│   └── tts-worker/             # Text-to-Speech ხმოვანი წაკითხვის სერვისი
├── packages/
│   ├── ui/                     # გაზიარებული UI კომპონენტები
│   ├── reader/                 # Online Reader კომპონენტი (გაზიარებული web/mobile-ს შორის)
│   ├── shared/                 # გაზიარებული ტიპები, ინტერფეისები, კონსტანტები
│   └── config/                 # ESLint, TypeScript, Prettier კონფიგურაცია
├── turbo.json
├── package.json
└── docs/
    ├── IDEA.md
    ├── ARCHITECTURE.md
    ├── FEATURES.md
    ├── TECH-STACK.md
    ├── ROADMAP.md
    ├── DATABASE.md
    └── API.md
```

## სისტემის არქიტექტურა (High-Level)

```
┌─────────────────────────────────────────────────────────────────┐
│                        კლიენტები                                │
│  ┌──────────────┐    ┌──────────────────┐                       │
│  │   Web App    │    │   Mobile App     │                       │
│  │  (Next.js)   │    │ (React Native)   │                       │
│  └──────┬───────┘    └────────┬─────────┘                       │
└─────────┼─────────────────────┼─────────────────────────────────┘
          │                     │
          ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Gateway                                │
│                     (NestJS API)                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │   Auth   │ │  Books   │ │ Payment  │ │  Translation  │  │  TTS     │ │
│  │ Module   │ │  Module  │ │ Module   │ │  Module       │  │  Module  │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────┬────────┘  └────┬─────┘ │
└──────────────────────────────────────────────────┼──────────────┘
          │                     │                  │
          ▼                     ▼                  ▼
┌──────────────┐  ┌──────────────────┐  ┌─────────────────────┐
│  PostgreSQL  │  │    AWS S3         │  │  Translator Worker  │
│  (Database)  │  │  (File Storage)   │  │  (Bull Queue +      │
│              │  │                    │  │   Claude API)       │
└──────────────┘  └──────────────────┘  └─────────────────────┘
                                                   │
                                           ┌───────┴───────┐
                                           │  Claude API   │
                                           │  (Anthropic)  │
                                           └───────────────┘
```

## კომპონენტების აღწერა

### 1. Web App (`apps/web`) — Next.js

ძირითადი ვებ აპლიკაცია, სადაც მომხმარებელი:
- რეგისტრირდება და ავტორიზდება
- ეძებს წიგნებს
- ატვირთავს წიგნებს
- იხდის თარგმანის საფასურს
- კითხულობს ნათარგმნ წიგნებს ონლაინ რიდერში
- მართავს თავის ბიბლიოთეკას

**ტექნიკური დეტალები:**
- Next.js 15 (App Router)
- React 19
- SCSS (Sass modules)
- next-intl — i18n (ქართული + ინგლისური, `[locale]` routing)
- React Query (TanStack Query) — სერვერის მონაცემების მართვა
- Zustand — კლიენტის სტეიტის მართვა
- Socket.io-client — რეალ-ტაიმ თარგმნის პროგრესი

### 2. Mobile App (`apps/mobile`) — React Native

მობილური აპლიკაცია iOS და Android-ისთვის. ფოკუსი:
- წიგნების კითხვა ონლაინ რიდერში
- ბიბლიოთეკის ნახვა
- სანიშნეები და პროგრესი
- Push ნოტიფიკაციები (თარგმნა დასრულდა)

**ტექნიკური დეტალები:**
- React Native 0.76+
- Expo (managed workflow)
- React Navigation
- React Native Paper ან NativeWind (TailwindCSS)

### 3. API Server (`apps/api`) — NestJS

ცენტრალური Backend სერვერი. მოდულები:

| მოდული | პასუხისმგებლობა |
|---|---|
| **Auth** | რეგისტრაცია, ლოგინი, JWT, OAuth, OTP, პაროლის აღდგენა |
| **Email** | Resend ინტეგრაცია, email ვერიფიკაცია, პაროლის აღდგენის email |
| **Users** | მომხმარებლის პროფილი, პარამეტრები |
| **Books** | წიგნების ძებნა, ატვირთვა, მეტადატა |
| **S3** | AWS S3 ფაილების მენეჯმენტი (upload, presigned URLs) |
| **Translation** | თარგმნის დაწყება, პროგრესის ტრეკინგი, შედეგი |
| **Payment** | BOG Pay, TBC Pay ინტეგრაცია |
| **Reader** | სანიშნეები, ხაზგასმები, შენიშვნები, კითხვის პროგრესი |
| **Library** | მომხმარებლის ბიბლიოთეკა |

**ტექნიკური დეტალები:**
- NestJS 10+
- Prisma ORM (PostgreSQL-თან)
- Passport.js (auth strategies)
- Bull/BullMQ (job queue — თარგმნისთვის)
- Socket.io (real-time progress)
- Multer (ფაილის ატვირთვა)
- AWS S3 SDK

### 4. Translator Worker (`apps/translator`) — Node.js

დამოუკიდებელი მიკროსერვისი, რომელიც ასრულებს წიგნის თარგმნას. ეშვება ცალკე პროცესად და Bull Queue-დან იღებს სამუშაოებს.

**პროცესი:**
1. Queue-დან იღებს წიგნის თარგმნის job-ს
2. S3-დან ჩამოტვირთავს ფაილს
3. ამუშავებს ფაილს (PDF → ტექსტი, EPUB → თავები)
4. ყოფს თავებად/სექციებად
5. თითოეულ სექციას აგზავნის Claude API-ზე თარგმნისთვის
6. პროგრესს აგზავნის Socket.io-ით რეალ-ტაიმში
7. ნათარგმნ ტექსტს ინახავს DB-ში და S3-ზე
8. აცნობებს მომხმარებელს (push notification / email)

**ტექნიკური დეტალები:**
- BullMQ Worker
- Anthropic Claude API (claude-sonnet-4-6 ან claude-opus-4-6)
- pdf-parse / pdf.js (PDF parsing)
- epub.js (EPUB parsing)
- mammoth (DOCX parsing)

### 5. TTS Worker (`apps/tts-worker`) — ხმოვანი წაკითხვის სერვისი

დამოუკიდებელი მიკროსერვისი, რომელიც წიგნის ტექსტს გარდაქმნის აუდიოდ. მუშაობს ანალოგიურად Translator Worker-ის — BullMQ Queue-დან იღებს სამუშაოებს.

**პროცესი:**
1. მომხმარებელი ითხოვს წიგნის / თავის ხმოვან წაკითხვას
2. API ქმნის TTS job-ს Queue-ში
3. TTS Worker იღებს job-ს და ამუშავებს ტექსტს
4. ტექსტი იყოფა ფრაგმენტებად (წინადადებები/აბზაცები)
5. თითოეული ფრაგმენტი იგზავნება TTS API-ზე (Google Cloud TTS / ElevenLabs)
6. გენერირებული აუდიო ფრაგმენტები ერთდება
7. აუდიო ფაილები ინახება S3-ზე
8. მომხმარებელს ეგზავნება ნოტიფიკაცია
9. აუდიო ხელმისაწვდომია streaming-ით ან ჩამოტვირთვით

**ტექნიკური დეტალები:**
- BullMQ Worker
- Google Cloud Text-to-Speech API (ქართული ხმები) ან ElevenLabs API
- ffmpeg (აუდიო ფრაგმენტების შეერთება, ფორმატის კონვერტაცია)
- აუდიო ფორმატები: MP3 (streaming), M4A (ჩამოტვირთვა)
- S3 presigned URLs — streaming-ისთვის
- Socket.io — აუდიო გენერაციის პროგრესი

**რეალ-ტაიმ vs Pre-generated:**
- **Pre-generated** — მთლიანი თავის აუდიო წინასწარ გენერირდება და S3-ზე ინახება (ხარისხიანი)
- **Real-time streaming** — მცირე ფრაგმენტების სწრაფი გენერაცია (დაბალი latency, მაგრამ ნაკლები ხარისხი)
- ჰიბრიდული მიდგომა: პირველი თავი რეალ-ტაიმში, დანარჩენი ფონში გენერირდება

---

## მონაცემთა ნაკადი (Data Flow)

### წიგნის ძებნა
```
მომხმარებელი → Web/Mobile → API → Google Books API + Open Library API → შედეგები → მომხმარებელი
                                  → DB შემოწმება (უკვე არის ბაზაში?) → ფასდაკლების შეთავაზება
```

### წიგნის თარგმნა
```
მომხმარებელი → ატვირთვა → API → S3 (ფაილის შენახვა)
                              → Payment (გადახდა)
                              → Bull Queue (job შექმნა)
                                    ↓
                              Translator Worker
                                    ↓
                              Claude API (თარგმნა)
                                    ↓
                              Socket.io (პროგრესი → მომხმარებელი)
                                    ↓
                              DB + S3 (შენახვა)
                                    ↓
                              ნოტიფიკაცია → მომხმარებელი
```

### წიგნის კითხვა
```
მომხმარებელი → Reader → API → DB (წიგნის შიგთავსი, სანიშნეები, პროგრესი)
                             → S3 (ფაილი, თუ საჭიროა)
```

## უსაფრთხოება

- **JWT + Refresh Tokens** — ავტორიზაცია
- **Rate Limiting** — API endpoints
- **ფაილის ვალიდაცია** — ატვირთული ფაილის ტიპისა და ზომის შემოწმება
- **CORS** — მხოლოდ ნებადართული დომენებიდან
- **Helmet.js** — HTTP headers უსაფრთხოება
- **გადახდის ვალიდაცია** — Webhook-ებით BOG/TBC-სგან
- **ფაილების წვდომა** — S3 Presigned URLs (დროში შეზღუდული ლინკები)

## სკალირება

- **Translator Worker** — ჰორიზონტალურად სკალირებადი (რამდენიმე worker ერთდროულად)
- **API** — Stateless, სკალირებადი load balancer-ით
- **DB** — PostgreSQL read replicas საჭიროებისას
- **S3** — თავისთავად სკალირებადია
- **Redis** — Bull Queue + Caching

## Docker (Development Environment)

```yaml
# docker-compose up -d — გაუშვებს PostgreSQL და Redis კონტეინერებს
services:
  postgres:  # PostgreSQL 16 — port 5432
  redis:     # Redis 7 — port 6379
```

## გაზიარებული პაკეტები (packages/)

```
packages/
├── config/    # ESLint, Prettier, TypeScript კონფიგურაცია
└── shared/    # გაზიარებული ტიპები და ინტერფეისები
```

მომავალი:
- `packages/ui` — გაზიარებული UI კომპონენტები (ფაზა 2+)
- `packages/reader` — Online Reader კომპონენტი (ფაზა 5)
