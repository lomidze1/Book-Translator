# Book Translator — არქიტექტურა

## მონორეპოს სტრუქტურა

პროექტი ორგანიზებულია **მონორეპოში** (Turborepo) და შედგება 4 ძირითადი პაკეტისგან:

```
book-translator/
├── apps/
│   ├── web/                    # Next.js ვებ აპლიკაცია
│   ├── mobile/                 # React Native მობილური აპლიკაცია
│   ├── api/                    # NestJS Backend API სერვერი
│   └── translator/             # თარგმნის მიკროსერვისი (Node.js Worker)
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
│  │   Auth   │ │  Books   │ │ Payment  │ │  Translation     │   │
│  │ Module   │ │  Module  │ │ Module   │ │  Module          │   │
│  └──────────┘ └──────────┘ └──────────┘ └────────┬─────────┘   │
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
- TailwindCSS + shadcn/ui
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
| **Auth** | რეგისტრაცია, ლოგინი, JWT, OAuth, OTP |
| **Users** | მომხმარებლის პროფილი, პარამეტრები |
| **Books** | წიგნების ძებნა, ატვირთვა, მეტადატა |
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
