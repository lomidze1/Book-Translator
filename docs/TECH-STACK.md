# Book Translator — ტექნოლოგიური სტეკი

## მონორეპო ინფრასტრუქტურა

| ინსტრუმენტი | დანიშნულება |
|---|---|
| **Turborepo** | მონორეპო მართვა, ბილდის ოპტიმიზაცია, caching |
| **pnpm** | პაკეტების მენეჯერი (სწრაფი, disk-efficient) |
| **TypeScript** | ყველა პაკეტში ტიპების უსაფრთხოება |

---

## Frontend — ვებ აპლიკაცია

| ტექნოლოგია | დანიშნულება | რატომ |
|---|---|---|
| **Next.js 15** | React Framework (App Router) | SSR, SEO, API routes, მაღალი პერფორმანსი |
| **React 19** | UI ბიბლიოთეკა | კომპონენტების არქიტექტურა |
| **TailwindCSS 4** | CSS Framework | სწრაფი სტილიზაცია, responsive design |
| **shadcn/ui** | UI კომპონენტები | ლამაზი, კასტომიზებადი, accessible |
| **TanStack Query** | სერვერის სტეიტი | caching, refetching, optimistic updates |
| **Zustand** | კლიენტის სტეიტი | მარტივი, მსუბუქი state management |
| **Socket.io-client** | WebSocket | თარგმნის რეალ-ტაიმ პროგრესი |
| **React Hook Form + Zod** | ფორმები + ვალიდაცია | type-safe ფორმები |
| **next-intl** | ინტერნაციონალიზაცია | ქართული და ინგლისური UI |

---

## Frontend — მობილური აპლიკაცია

| ტექნოლოგია | დანიშნულება | რატომ |
|---|---|---|
| **React Native 0.76+** | მობილური framework | iOS + Android ერთი codebase |
| **Expo** | React Native toolkit | მარტივი build, OTA updates |
| **React Navigation** | ნავიგაცია | სტანდარტული mobile navigation |
| **NativeWind** | სტილიზაცია | TailwindCSS React Native-ში |
| **Expo Notifications** | Push ნოტიფიკაციები | თარგმნა დასრულდა |
| **MMKV** | ლოკალური storage | სწრაფი key-value storage |

---

## Backend — API სერვერი

| ტექნოლოგია | დანიშნულება | რატომ |
|---|---|---|
| **NestJS 10+** | Backend Framework | მოდულური, scalable, TypeScript-native |
| **Prisma** | ORM | type-safe DB queries, მარტივი მიგრაციები |
| **PostgreSQL 16** | მონაცემთა ბაზა | რელაციური, საიმედო, JSON მხარდაჭერა |
| **Redis** | Cache + Queue | Bull Queue, session cache, rate limiting |
| **BullMQ** | Job Queue | თარგმნის სამუშაოების რიგი |
| **Socket.io** | WebSocket სერვერი | რეალ-ტაიმ კომუნიკაცია |
| **Passport.js** | ავტორიზაცია | JWT, Google OAuth, Phone OTP |
| **Multer** | ფაილის ატვირთვა | multipart/form-data |
| **class-validator** | ვალიდაცია | DTO ვალიდაცია |
| **Helmet** | უსაფრთხოება | HTTP headers |
| **Throttler** | Rate Limiting | API-ს დაცვა |

---

## Translator Worker

| ტექნოლოგია | დანიშნულება | რატომ |
|---|---|---|
| **BullMQ Worker** | Job processing | Queue-დან სამუშაოების აღება |
| **@anthropic-ai/sdk** | Claude API | ძირითადი AI თარგმანი |
| **pdf-parse** | PDF → ტექსტი | PDF ფაილების დამუშავება |
| **epub2** | EPUB → თავები | EPUB ფაილების დამუშავება |
| **mammoth** | DOCX → HTML/ტექსტი | Word ფაილების დამუშავება |
| **franc** | ენის ამოცნობა | ატვირთული ფაილის ენის შემოწმება |

---

## Online Reader

| ტექნოლოგია | დანიშნულება | რატომ |
|---|---|---|
| **epub.js** (ვებისთვის) | EPUB rendering | სტანდარტული ebook reader |
| **Custom React Reader** | თარგმანის ჩვენება | კასტომ reader კომპონენტი |

---

## TTS Worker — ხმოვანი წაკითხვის სერვისი

| ტექნოლოგია | დანიშნულება | რატომ |
|---|---|---|
| **BullMQ Worker** | Job processing | Queue-დან აუდიო გენერაციის სამუშაოების აღება |
| **Google Cloud TTS (Neural2)** | Text-to-Speech API | საუკეთესო ქართული ხმები, ბუნებრივი ჟღერადობა |
| **ffmpeg (fluent-ffmpeg)** | აუდიო processing | ფრაგმენტების შეერთება, ფორმატის კონვერტაცია, bitrate |
| **AWS S3** | აუდიო ფაილების შენახვა | MP3/M4A ფაილების storage + streaming |
| **Socket.io** | რეალ-ტაიმ პროგრესი | აუდიო გენერაციის პროგრესის ჩვენება |

### მობილური აუდიო პლეიერი

| ტექნოლოგია | დანიშნულება | რატომ |
|---|---|---|
| **expo-av** | აუდიო playback | Expo-ს ოფიციალური აუდიო ბიბლიოთეკა |
| **react-native-track-player** | Background playback | Lock screen controls, notification player, CarPlay/Android Auto |
| **@react-native-community/slider** | Progress slider | აუდიოში ნავიგაცია |

### ვებ აუდიო პლეიერი

| ტექნოლოგია | დანიშნულება | რატომ |
|---|---|---|
| **HTML5 Audio API** | აუდიო playback | ბრაუზერის ნეიტივი, არ სჭირდება ბიბლიოთეკა |
| **Media Session API** | OS-level controls | ბრაუზერის მინი-პლეიერი, keyboard media keys |

### რატომ Google Cloud TTS?

1. **ქართული ენის მხარდაჭერა** — Neural2 ხმები ქართულისთვის (ka-GE)
2. **ბუნებრივი ჟღერადობა** — WaveNet/Neural2 ტექნოლოგია, არა რობოტული
3. **SSML მხარდაჭერა** — პაუზები, ინტონაცია, სიჩქარის კონტროლი
4. **მაღალი throughput** — დიდი ტექსტის სწრაფი დამუშავება
5. **ფასი** — ~$4/1M სიმბოლო (Neural2), ~$16/1M (Studio) — გონივრული

---

## გარე სერვისები და API-ები

| სერვისი | დანიშნულება |
|---|---|
| **Claude API (Anthropic)** | AI წიგნის თარგმანი |
| **Google Books API** | წიგნების ძებნა, მეტადატა |
| **Open Library API** | დამატებითი წიგნების ინფო |
| **BOG Pay API** | საქართველოს ბანკის გადახდა |
| **TBC Pay API** | თიბისის გადახდა |
| **Twilio / MessageBird** | SMS OTP |
| **Resend / SendGrid** | Email (ტრანზაქციული) |
| **Google OAuth** | სოციალური ავტორიზაცია |
| **Sentry** | Error tracking |

---

## ინფრასტრუქტურა და DevOps

| ტექნოლოგია | დანიშნულება | რატომ |
|---|---|---|
| **AWS S3** | ფაილების შენახვა | წიგნების PDF/EPUB + ნათარგმნი ფაილები |
| **Vercel** | Web App hosting | Next.js-ის ოპტიმალური ჰოსტინგი |
| **Railway** | API + Worker + DB + Redis | მარტივი deployment, auto-scaling |
| **Docker** | კონტეინერიზაცია | თანმიმდევრული გარემო |
| **GitHub Actions** | CI/CD | ავტომატური ტესტირება და deployment |

### რატომ Vercel + Railway?

- **Vercel** — Next.js-ის შემქმნელების პლატფორმა, ოპტიმალური CDN, edge functions, ავტომატური SSL
- **Railway** — PostgreSQL, Redis, Node.js სერვისები ერთ ადგილას, მარტივი კონფიგურაცია, auto-scaling
- ამ კომბინაციით ბიუჯეტი გონივრულია და ხარისხი მაღალი
- თუ მომავალში საჭირო გახდება → AWS-ზე მიგრაცია მარტივია Docker-ის წყალობით

---

## განვითარების ინსტრუმენტები

| ინსტრუმენტი | დანიშნულება |
|---|---|
| **ESLint** | კოდის ხარისხი |
| **Prettier** | კოდის ფორმატირება |
| **Vitest** | Unit/Integration ტესტები |
| **Playwright** | E2E ტესტები (ვები) |
| **Detox** | E2E ტესტები (მობილური) |
| **Husky** | Git hooks (pre-commit) |
| **lint-staged** | staged ფაილების linting |

---

## AI თარგმანის სტრატეგია

### რატომ Claude API?

1. **დიდი კონტექსტის ფანჯარა (200K tokens)** — შეიძლება მთელი თავი ერთდროულად
2. **ქართული ენის ხარისხი** — Claude-ს კარგი ქართული ენის მხარდაჭერა აქვს
3. **კონტექსტუალური თარგმანი** — ესმის ნარატივი, პერსონაჟები, მეტაფორები
4. **თანმიმდევრულობა** — system prompt-ით პერსონაჟების სახელების, ტერმინების თანმიმდევრულობა

### თარგმანის ოპტიმიზაცია

- **Batch processing** — თავები/სექციები პარალელურად (rate limits-ის ფარგლებში)
- **Context window management** — წინა თავის რეზიუმე შემდეგ თავის prompt-ში
- **Glossary** — პერსონაჟების სახელების და ტერმინების ლექსიკონი, რომელიც მთელი წიგნის განმავლობაში ინარჩუნებს თანმიმდევრულობას
- **Retry logic** — API შეცდომის შემთხვევაში ხელახლა ცდა exponential backoff-ით
