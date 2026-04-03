# Book Translator — განვითარების გეგმა (Roadmap)

## ფაზა 1: ფუნდამენტი (MVP Foundation) ✅
**მიზანი:** მონორეპოს სტრუქტურა, ავტორიზაცია, ბაზის მოდელები

### ამოცანები:
- [x] მონორეპოს ინიციალიზაცია (Turborepo + pnpm)
- [x] TypeScript კონფიგურაცია (გაზიარებული)
- [x] ESLint + Prettier კონფიგურაცია
- [x] Next.js აპლიკაციის შექმნა (`apps/web`)
- [x] NestJS API-ის შექმნა (`apps/api`)
- [x] PostgreSQL + Prisma სეტაპი
- [x] მონაცემთა ბაზის სქემა (მომხმარებლები, წიგნები, თარგმნები)
- [x] ავტორიზაციის მოდული:
  - [x] Email + პაროლი (რეგისტრაცია, ლოგინი)
  - [x] JWT + Refresh Token
  - [x] Google OAuth
  - [x] ტელეფონი + OTP
- [x] მომხმარებლის პროფილის API
- [x] ვებ UI: Landing page, Login/Register გვერდები
- [x] Docker Compose (dev გარემო: DB + Redis)

---

## ფაზა 2: წიგნის ძებნა და ატვირთვა ✅
**მიზანი:** წიგნების ძებნა, ატვირთვა, S3 ინტეგრაცია

### ამოცანები:
- [x] Google Books API ინტეგრაცია
- [x] Open Library API ინტეგრაცია
- [x] ძებნის API endpoint (aggregated results)
- [x] ვებ UI: საძიებო გვერდი, შედეგების ჩვენება
- [x] AWS S3 სეტაპი (bucket, IAM)
- [x] ფაილის ატვირთვის API (PDF, EPUB, TXT, DOCX)
- [x] ფაილის ვალიდაცია (ტიპი, ზომა, შიგთავსი)
- [ ] წიგნის მეტადატის ავტომატური ამოცნობა (ფაილის შიგთავსიდან)
- [x] დუბლიკატის შემოწმება (file hash)
- [x] ვებ UI: ატვირთვის კომპონენტი (Drag & Drop)
- [x] ვებ UI: წიგნის დეტალების გვერდი
- [x] i18n (next-intl) — ქართული + ინგლისური ენების მხარდაჭერა
- [x] ატვირთვისას pageCount-ის ავტომატური გამოთვლა (parsing)

---

## ფაზა 2.5: Email სერვისი & პაროლის აღდგენა ✅
**მიზანი:** Resend ინტეგრაცია, პაროლის აღდგენა, email ვერიფიკაცია
**დეტალური გეგმა:** [`docs/PASSWORD-RESET.md`](./PASSWORD-RESET.md)

### ამოცანები:
- [x] Resend ინტეგრაცია (EmailModule + EmailService)
- [x] Prisma schema — password reset & email verification ველები + მიგრაცია
- [x] პაროლის აღდგენა (forgot-password + reset-password endpoints)
- [x] Email ვერიფიკაცია (verify-email endpoint + register() განახლება)
- [x] HTML email ტემპლეიტები (ქართული)
- [x] Frontend გვერდები: forgot-password, reset-password, verify-email
- [x] ტესტები (unit + integration)

---

## ფაზა 3: AI თარგმნის სისტემა ✅
**მიზანი:** წიგნის თარგმნის pipeline, რეალ-ტაიმ პროგრესი

### ამოცანები:
- [x] Redis + BullMQ სეტაპი
- [x] Translation Worker (BullMQ processor — `translation.processor.ts`)
- [x] PDF parsing (pdf-parse)
- [x] EPUB parsing (epub2)
- [x] DOCX parsing (mammoth)
- [x] TXT parsing
- [x] Claude API ინტეგრაცია (@anthropic-ai/sdk, Sonnet 4)
- [x] თარგმანის system prompt ოპტიმიზაცია
- [x] თავებად დაყოფის ლოგიკა
- [x] დიდი თავების chunking (8K chars per chunk)
- [x] კონტექსტის მართვა (glossary, წინა თავის რეზიუმე)
- [ ] Socket.io — რეალ-ტაიმ პროგრესის ჩვენება
- [x] Polling-based პროგრესის ჩვენება (15 წამიანი ინტერვალი)
- [x] ნათარგმნი ტექსტის შენახვა (DB + S3)
- [x] Retry logic / Error handling (BullMQ 3 attempts + exponential backoff)
- [x] ვებ UI: თარგმნის პროგრესის გვერდი
- [x] Dev mode: გადახდის გარეშე თარგმნის დაწყება

---

## ფაზა 4: გადახდის სისტემა 🟡 (ნაწილობრივ)
**მიზანი:** BOG Pay და TBC Pay ინტეგრაცია

### ამოცანები:
- [x] გადახდის ჩანაწერების DB მოდელი (Payment, PaymentStatus, PaymentProvider)
- [x] გადახდის ფლოუ (create order → redirect → callback)
- [x] Webhook endpoints (გადახდის დადასტურება)
- [x] ფასების ლოგიკა — დინამიური (გვერდების მიხედვით):
  - [x] სწრაფი = გვერდები × 0.15₾ (min 10₾)
  - [x] ეკონომიური = გვერდები × 0.07₾ (min 10₾)
  - [x] უკვე ნათარგმნი = 5₾ ფიქსირებული
  - [x] .env-ით კონფიგურირებადი ფასები
- [x] ვებ UI: ორი ვარიანტი (სწრაფი/ეკონომიური) + ფასის ჩვენება
- [x] ვებ UI: PaymentModal (პროვაიდერის არჩევა)
- [x] ვებ UI: წარმატების/წარუმატებლობის გვერდები
- [x] Mock payment (dev-ისთვის)
- [x] ტრანზაქციების ისტორია API + UI
- [ ] BOG Pay (iPay) რეალური API ინტეგრაცია
- [ ] TBC Pay რეალური API ინტეგრაცია

---

## ფაზა 5: Online Reader + React Native 🔜
**მიზანი:** სრულფასოვანი ონლაინ მკითხველი (ვები + მობილური)
**დეტალური გეგმა:** [`docs/PHASE5-READER-PLAN.md`](./PHASE5-READER-PLAN.md)

### ამოცანები:
- [x] მინიმალური Reader გვერდი (თავების ჩვენება + TOC)
- [x] DB მოდელები (Bookmark, Highlight, Note, ReadingProgress)
- [ ] `packages/reader/` — საერთო ლოგიკა (hooks, API client, types)
- [ ] Reader API Module (bookmarks, highlights, notes, progress endpoints)
- [ ] ვებ Reader — სრულყოფილი:
  - [ ] თემების სისტემა (ღია, სეპია, მუქი)
  - [ ] შრიფტის ზომა, ტიპი, ინტერვალი
  - [ ] სანიშნეები (bookmarks) — UI
  - [ ] ხაზგასმები (highlights) — ტექსტის მონიშვნა, 4 ფერი
  - [ ] შენიშვნები (notes) — UI
  - [ ] კითხვის პროგრესის ტრეკინგი + ავტო-შენახვა
  - [ ] თავების ნავიგაცია (სარჩევი)
  - [ ] სრულ ეკრანზე რეჟიმი
  - [ ] გვერდებად vs სქროლით კითხვა
- [ ] React Native (Expo) აპლიკაცია:
  - [ ] Expo პროექტის შექმნა (`apps/mobile`)
  - [ ] ნავიგაციის სტრუქტურა (Expo Router)
  - [ ] ავტორიზაცია (email, Google, phone)
  - [ ] ბიბლიოთეკის ეკრანი
  - [ ] Mobile Reader (swipe, pinch-zoom, touch)
  - [ ] სანიშნეები, ხაზგასმები, შენიშვნები
  - [ ] კითხვის სინქრონიზაცია ვებთან
- [ ] PWA setup (manifest, service worker, offline cache)

---

## ფაზა 6: ხმოვანი წაკითხვა (TTS Service)
**მიზანი:** წიგნის ხმოვანი წაკითხვის სრული სისტემა

### ამოცანები:
- [ ] TTS Worker სერვისის შექმნა (`apps/tts-worker`)
- [ ] Google Cloud TTS API ინტეგრაცია (ქართული Neural2 ხმები)
- [ ] BullMQ — აუდიო გენერაციის job queue
- [ ] ტექსტის ფრაგმენტებად დაყოფა (წინადადებები/აბზაცები)
- [ ] ffmpeg — ფრაგმენტების შეერთება MP3/M4A ფაილებად
- [ ] S3 — აუდიო ფაილების შენახვა და streaming
- [ ] აუდიო caching — ერთხელ გენერირებული აუდიოს ხელახლა გამოყენება
- [ ] Socket.io — აუდიო გენერაციის რეალ-ტაიმ პროგრესი
- [x] DB მოდელები — AudioBook, AudioChapter ცხრილები (Prisma-ში მზადაა)
- [ ] ვებ აუდიო პლეიერი:
  - [ ] Play/Pause/Stop, წინ/უკან გადახტომა
  - [ ] პროგრეს ბარი, სიჩქარის რეგულირება
  - [ ] ტექსტის highlight (karaoke-style sync)
  - [ ] Sleep Timer
  - [ ] Media Session API (keyboard media keys)
- [ ] მობილური აუდიო პლეიერი:
  - [ ] Background audio playback
  - [ ] Lock screen controls
  - [ ] Headphone controls
- [ ] ხმის პარამეტრები — ხმის არჩევა, სიჩქარე, ტონი
- [ ] თავის არჩევა / სარჩევიდან ნავიგაცია
- [ ] API endpoints — TTS generation, audio streaming, progress

---

## ფაზა 7: მომხმარებლის Dashboard
**მიზანი:** მომხმარებლის პანელი, ბიბლიოთეკა

### ამოცანები:
- [ ] Dashboard layout
- [ ] ბიბლიოთეკის გვერდი (ნათარგმნი წიგნები)
- [ ] კითხვის პროგრესი ბიბლიოთეკაში
- [ ] ფილტრები (ყველა, მიმდინარე, წაკითხული)
- [x] თარგმნის ისტორია + სტატუსი (profile/translations გვერდი)
- [x] გადახდების ისტორია (API მზადაა)
- [x] პროფილის რედაქტირების გვერდი
- [ ] ნოტიფიკაციების პარამეტრები
- [ ] Reader-ის default პარამეტრები

---

## ფაზა 8: მობილური აპლიკაცია — გადმოვიდა ფაზა 5-ში ✅
> React Native აპლიკაცია ფაზა 5-ში გაერთიანდა (shared `packages/reader/` არქიტექტურით).
> App Store / Play Store პუბლიკაცია ფაზა 10-ში.

---

## ფაზა 9: Push ნოტიფიკაციები & დამატებითი Email-ები
**მიზანი:** ნოტიფიკაციების სისტემის გაფართოება

### ამოცანები:
- [ ] დამატებითი email templates (თარგმნა დასრულდა, გადახდის ქვითარი)
- [ ] Push notifications სერვისი (ვები + მობილური)
- [ ] In-app ნოტიფიკაციები

---

## ფაზა 10: პოლისინგი და ოპტიმიზაცია
**მიზანი:** ხარისხის გაუმჯობესება, ტესტირება, დეპლოი

### ამოცანები:
- [x] Unit ტესტები (Vitest, 700+)
- [ ] Integration ტესტები (API)
- [ ] E2E ტესტები (Playwright)
- [ ] Performance ოპტიმიზაცია
- [x] SEO ოპტიმიზაცია (JSON-LD, meta tags, sitemap, robots.txt)
- [ ] Accessibility (a11y)
- [ ] Error tracking (Sentry)
- [ ] Logging სისტემა
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Production deployment (Vercel + Railway)
- [ ] App Store / Play Store პუბლიკაცია

---

## ფაზა 11: მომავალი ფუნქციები (v2)
**მიზანი:** პლატფორმის გაფართოება

### ამოცანები:
- [ ] ადმინ პანელი
- [ ] დამატებითი ენების მხარდაჭერა
- [ ] წიგნების რეკომენდაციის სისტემა
- [ ] კომუნიტი (შეფასებები, რეცენზიები)
- [ ] Offline კითხვა (მობილური)
- [ ] თარგმანის რედაქტირება (split view)
- [ ] წიგნების კატალოგი (ნათარგმნი წიგნების მაღაზია)
- [ ] საკუთარი LLM მოდელის fine-tuning (NLLB-200 ან Llama)
- [ ] Batch API ინტეგრაცია (ეკონომიური თარგმნისთვის)

---

## პროგრესის შეჯამება

| ფაზა | სტატუსი | პროგრესი |
|---|---|---|
| ფაზა 1: ფუნდამენტი | ✅ დასრულებული | 100% |
| ფაზა 2: ძებნა + ატვირთვა | ✅ დასრულებული | 95% |
| ფაზა 2.5: Email/Resend | ✅ დასრულებული | 100% |
| ფაზა 3: AI თარგმნა | ✅ დასრულებული | 90% (Socket.io დარჩა) |
| ფაზა 4: გადახდა | 🟡 ნაწილობრივ | 70% (BOG/TBC რეალური API დარჩა) |
| ფაზა 5: Reader + Mobile | 🔜 შემდეგი | 15% (მინიმალური reader + DB models) |
| ფაზა 6: TTS | ❌ | 5% (DB models მზადაა) |
| ფაზა 7: Dashboard | 🟡 ნაწილობრივ | 30% |
| ფაზა 9: ნოტიფიკაციები | ❌ | 0% |
| ფაზა 10: პოლისინგი | 🟡 | 20% (ტესტები + SEO) |
| ფაზა 11: v2 | ❌ | 0% |
