# 📚 Book Translator

ინგლისურენოვანი წიგნების ქართულ ენაზე AI თარგმანის პლატფორმა.

## რა არის Book Translator?

Book Translator საშუალებას აძლევს მომხმარებლებს:
- მოძებნონ ინგლისურენოვანი წიგნები
- ატვირთონ PDF, EPUB, TXT ან DOCX ფორმატში
- AI-ით (Claude API) გადათარგმნონ ქართულ ენაზე
- წაიკითხონ ჩაშენებულ Online Reader-ში (ვები + მობილური)

## მონორეპოს სტრუქტურა

```
apps/
  web/          → Next.js ვებ აპლიკაცია
  mobile/       → React Native მობილური (iOS + Android)
  api/          → NestJS Backend API
  translator/   → AI თარგმნის Worker სერვისი

packages/
  ui/           → გაზიარებული UI კომპონენტები
  reader/       → Online Reader კომპონენტი
  shared/       → გაზიარებული ტიპები და ინტერფეისები
  config/       → ESLint, TypeScript, Prettier კონფიგურაცია
```

## ტექნოლოგიური სტეკი

- **Frontend:** Next.js 15, React 19, TailwindCSS, shadcn/ui
- **Mobile:** React Native (Expo)
- **Backend:** NestJS, Prisma, PostgreSQL, Redis, BullMQ
- **AI:** Claude API (Anthropic)
- **Storage:** AWS S3
- **Payments:** BOG Pay, TBC Pay

## დოკუმენტაცია

| ფაილი | აღწერა |
|---|---|
| [IDEA.md](docs/IDEA.md) | პროექტის კონცეფცია და ხედვა |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | სისტემის არქიტექტურა |
| [FEATURES.md](docs/FEATURES.md) | ფუნქციონალის დეტალური აღწერა |
| [TECH-STACK.md](docs/TECH-STACK.md) | ტექნოლოგიების არჩევანი და დასაბუთება |
| [ROADMAP.md](docs/ROADMAP.md) | განვითარების გეგმა ფაზებად |
| [DATABASE.md](docs/DATABASE.md) | მონაცემთა ბაზის სქემა |
| [API.md](docs/API.md) | API endpoints დოკუმენტაცია |

## ლიცენზია

Private — All rights reserved.
