# Book Translator

ინგლისურენოვანი წიგნების ქართულ ენაზე AI თარგმანის პლატფორმა.

## რა არის Book Translator?

Book Translator საშუალებას აძლევს მომხმარებლებს:
- მოძებნონ ინგლისურენოვანი წიგნები (Google Books + Open Library + შიდა ბაზა)
- ატვირთონ PDF, EPUB, TXT ან DOCX ფორმატში
- AI-ით (Claude API) გადათარგმნონ ქართულ ენაზე
- წაიკითხონ ჩაშენებულ Online Reader-ში (სანიშნეები, ხაზგასმები, შენიშვნები)
- მოუსმინონ წიგნს ხმოვანი წაკითხვით (Google Cloud TTS)
- მიიღონ ნოტიფიკაციები (email, push, in-app)

## მონორეპოს სტრუქტურა

```
apps/
  web/          → Next.js 15 ვებ აპლიკაცია (SCSS, next-intl)
  mobile/       → React Native მობილური (Expo)
  api/          → NestJS Backend API

packages/
  reader/       → Online Reader გაზიარებული ლოგიკა
  shared/       → გაზიარებული ტიპები და ინტერფეისები
  config/       → ESLint, TypeScript, Prettier კონფიგურაცია
```

## ტექნოლოგიური სტეკი

- **Frontend:** Next.js 15, React 19, SCSS modules, next-intl (i18n: ka/en)
- **Mobile:** React Native (Expo)
- **Backend:** NestJS, Prisma, PostgreSQL 16, Redis 7, BullMQ
- **AI:** Claude API (Anthropic) — წიგნის თარგმანი
- **TTS:** Google Cloud TTS (Neural2), ElevenLabs, Azure — ხმოვანი წაკითხვა
- **Auth:** JWT + Google OAuth (google-auth-library) + Phone OTP
- **Storage:** AWS S3
- **Payments:** BOG Pay, TBC Pay
- **Email:** Resend
- **Notifications:** Web Push (VAPID), Socket.IO, BullMQ
- **Monitoring:** Sentry
- **Testing:** Vitest (700+ tests)

## ძირითადი ბრძანებები

```bash
pnpm install                              # Dependencies
docker-compose up -d                      # PostgreSQL + Redis
cd apps/api && npx prisma migrate dev     # Prisma მიგრაცია
cd apps/api && npx vitest run             # ტესტები
pnpm turbo build                          # Build
```

## დოკუმენტაცია

| ფაილი | აღწერა |
|---|---|
| [IDEA.md](docs/IDEA.md) | პროექტის კონცეფცია და ხედვა |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | სისტემის არქიტექტურა |
| [FEATURES.md](docs/FEATURES.md) | ფუნქციონალის დეტალური აღწერა |
| [TECH-STACK.md](docs/TECH-STACK.md) | ტექნოლოგიების არჩევანი |
| [ROADMAP.md](docs/ROADMAP.md) | განვითარების გეგმა ფაზებად |
| [DATABASE.md](docs/DATABASE.md) | მონაცემთა ბაზის სქემა |
| [API.md](docs/API.md) | API endpoints დოკუმენტაცია |
| [TodoBeforeProduction.md](docs/TodoBeforeProduction.md) | Production checklist |

## ლიცენზია

Private — All rights reserved.
