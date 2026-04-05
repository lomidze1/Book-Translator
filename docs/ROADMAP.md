# Book Translator — განვითარების გეგმა (Roadmap)

## ფაზა 1: ფუნდამენტი (MVP Foundation) ✅
**მიზანი:** მონორეპოს სტრუქტურა, ავტორიზაცია, ბაზის მოდელები

### ამოცანები:
| ამოცანა | სტატუსი | დატესტილია |
|---|---|---|
| მონორეპოს ინიციალიზაცია (Turborepo + pnpm) | ✅ | ❌ |
| TypeScript კონფიგურაცია (გაზიარებული) | ✅ | ❌ |
| ESLint + Prettier კონფიგურაცია | ✅ | ❌ |
| Next.js აპლიკაციის შექმნა (`apps/web`) | ✅ | ❌ |
| NestJS API-ის შექმნა (`apps/api`) | ✅ | ❌ |
| PostgreSQL + Prisma სეტაპი | ✅ | ❌ |
| მონაცემთა ბაზის სქემა (მომხმარებლები, წიგნები, თარგმნები) | ✅ | ❌ |
| ავტორიზაცია: Email + პაროლი (რეგისტრაცია, ლოგინი) | ✅ | ❌ |
| ავტორიზაცია: JWT + Refresh Token | ✅ | ❌ |
| ავტორიზაცია: Google OAuth | ✅ | ❌ |
| ავტორიზაცია: ტელეფონი + OTP | ✅ | ❌ |
| მომხმარებლის პროფილის API | ✅ | ❌ |
| ვებ UI: Landing page, Login/Register გვერდები | ✅ | ❌ |
| Docker Compose (dev გარემო: DB + Redis) | ✅ | ❌ |

---

## ფაზა 2: წიგნის ძებნა და ატვირთვა ✅
**მიზანი:** წიგნების ძებნა, ატვირთვა, S3 ინტეგრაცია

### ამოცანები:
| ამოცანა | სტატუსი | დატესტილია |
|---|---|---|
| Google Books API ინტეგრაცია | ✅ | ❌ |
| Open Library API ინტეგრაცია | ✅ | ❌ |
| ძებნის API endpoint (aggregated results) | ✅ | ❌ |
| ვებ UI: საძიებო გვერდი, შედეგების ჩვენება | ✅ | ❌ |
| AWS S3 სეტაპი (bucket, IAM) | ✅ | ❌ |
| ფაილის ატვირთვის API (PDF, EPUB, TXT, DOCX) | ✅ | ❌ |
| ფაილის ვალიდაცია (ტიპი, ზომა, შიგთავსი) | ✅ | ❌ |
| წიგნის მეტადატის ავტომატური ამოცნობა (ფაილის შიგთავსიდან) | ✅ | ❌ |
| დუბლიკატის შემოწმება (file hash) | ✅ | ❌ |
| ვებ UI: ატვირთვის კომპონენტი (Drag & Drop) | ✅ | ❌ |
| ვებ UI: წიგნის დეტალების გვერდი | ✅ | ❌ |
| i18n (next-intl) — ქართული + ინგლისური ენების მხარდაჭერა | ✅ | ❌ |
| ატვირთვისას pageCount-ის ავტომატური გამოთვლა (parsing) | ✅ | ❌ |

---

## ფაზა 2.5: Email სერვისი & პაროლის აღდგენა ✅
**მიზანი:** Resend ინტეგრაცია, პაროლის აღდგენა, email ვერიფიკაცია
**დეტალური გეგმა:** [`docs/PASSWORD-RESET.md`](./PASSWORD-RESET.md)

### ამოცანები:
| ამოცანა | სტატუსი | დატესტილია |
|---|---|---|
| Resend ინტეგრაცია (EmailModule + EmailService) | ✅ | ❌ |
| Prisma schema — password reset & email verification ველები + მიგრაცია | ✅ | ❌ |
| პაროლის აღდგენა (forgot-password + reset-password endpoints) | ✅ | ❌ |
| Email ვერიფიკაცია (verify-email endpoint + register() განახლება) | ✅ | ❌ |
| HTML email ტემპლეიტები (ქართული) | ✅ | ❌ |
| Frontend გვერდები: forgot-password, reset-password, verify-email | ✅ | ❌ |
| ტესტები (unit + integration) | ✅ | ❌ |

---

## ფაზა 3: AI თარგმნის სისტემა ✅
**მიზანი:** წიგნის თარგმნის pipeline, რეალ-ტაიმ პროგრესი

### ამოცანები:
| ამოცანა | სტატუსი | დატესტილია |
|---|---|---|
| Redis + BullMQ სეტაპი | ✅ | ❌ |
| Translation Worker (BullMQ processor — `translation.processor.ts`) | ✅ | ❌ |
| PDF parsing (pdf-parse) | ✅ | ❌ |
| EPUB parsing (epub2) | ✅ | ❌ |
| DOCX parsing (mammoth) | ✅ | ❌ |
| TXT parsing | ✅ | ❌ |
| Claude API ინტეგრაცია (@anthropic-ai/sdk, Sonnet 4) | ✅ | ❌ |
| თარგმანის system prompt ოპტიმიზაცია | ✅ | ❌ |
| თავებად დაყოფის ლოგიკა | ✅ | ❌ |
| დიდი თავების chunking (8K chars per chunk) | ✅ | ❌ |
| კონტექსტის მართვა (glossary, წინა თავის რეზიუმე) | ✅ | ❌ |
| Socket.io — რეალ-ტაიმ პროგრესის ჩვენება | ✅ | ❌ |
| Polling-based პროგრესის ჩვენება (15 წამიანი ინტერვალი) | ✅ | ❌ |
| ნათარგმნი ტექსტის შენახვა (DB + S3) | ✅ | ❌ |
| Retry logic / Error handling (BullMQ 3 attempts + exponential backoff) | ✅ | ❌ |
| ვებ UI: თარგმნის პროგრესის გვერდი | ✅ | ❌ |
| Dev mode: გადახდის გარეშე თარგმნის დაწყება | ✅ | ❌ |

---

## ფაზა 4: გადახდის სისტემა ✅
**მიზანი:** BOG Pay და TBC Pay ინტეგრაცია

### ამოცანები:
| ამოცანა | სტატუსი | დატესტილია |
|---|---|---|
| გადახდის ჩანაწერების DB მოდელი (Payment, PaymentStatus, PaymentProvider) | ✅ | ❌ |
| გადახდის ფლოუ (create order → redirect → callback) | ✅ | ❌ |
| Webhook endpoints (გადახდის დადასტურება) | ✅ | ❌ |
| ფასების ლოგიკა — სწრაფი = გვერდები × 0.15₾ (min 10₾) | ✅ | ❌ |
| ფასების ლოგიკა — ეკონომიური = გვერდები × 0.07₾ (min 10₾) | ✅ | ❌ |
| ფასების ლოგიკა — უკვე ნათარგმნი = 5₾ ფიქსირებული | ✅ | ❌ |
| .env-ით კონფიგურირებადი ფასები | ✅ | ❌ |
| ვებ UI: ორი ვარიანტი (სწრაფი/ეკონომიური) + ფასის ჩვენება | ✅ | ❌ |
| ვებ UI: PaymentModal (პროვაიდერის არჩევა) | ✅ | ❌ |
| ვებ UI: წარმატების/წარუმატებლობის გვერდები | ✅ | ❌ |
| Mock payment (dev-ისთვის) | ✅ | ❌ |
| ტრანზაქციების ისტორია API + UI | ✅ | ❌ |
| BOG Pay (iPay) რეალური API ინტეგრაცია | ✅ | ❌ |
| TBC Pay რეალური API ინტეგრაცია | ✅ | ❌ |

---

## ფაზა 5: Online Reader + React Native ✅
**მიზანი:** სრულფასოვანი ონლაინ მკითხველი (ვები + მობილური)
**დეტალური გეგმა:** [`docs/PHASE5-READER-PLAN.md`](./PHASE5-READER-PLAN.md)

### ამოცანები:
| ამოცანა | სტატუსი | დატესტილია |
|---|---|---|
| მინიმალური Reader გვერდი (თავების ჩვენება + TOC) | ✅ | ❌ |
| DB მოდელები (Bookmark, Highlight, Note, ReadingProgress) | ✅ | ❌ |
| `packages/reader/` — საერთო ლოგიკა (hooks, API client, types) | ✅ | ❌ |
| Reader API Module (bookmarks, highlights, notes, progress endpoints) | ✅ | ❌ |
| ვებ Reader — ReaderView, Sidebar, Toolbar, TextSelectionPopup | ✅ | ❌ |
| ვებ Reader — თემების სისტემა (ღია, სეპია, მუქი) | ✅ | ❌ |
| ვებ Reader — შრიფტის ზომა, ტიპი, ინტერვალი | ✅ | ❌ |
| ვებ Reader — სანიშნეები (bookmarks) UI | ✅ | ❌ |
| ვებ Reader — ხაზგასმები (highlights) UI | ✅ | ❌ |
| ვებ Reader — შენიშვნები (notes) UI + NoteEditor | ✅ | ❌ |
| ვებ Reader — კითხვის პროგრესის ტრეკინგი + ავტო-შენახვა | ✅ | ❌ |
| ვებ Reader — თავების ნავიგაცია (სარჩევი) | ✅ | ❌ |
| ვებ Reader — სრულ ეკრანზე რეჟიმი | ✅ | ❌ |
| ვებ Reader — გვერდებად vs სქროლით კითხვა | ✅ | ❌ |
| React Native (Expo) — პროექტის შექმნა (`apps/mobile`) | ✅ | ❌ |
| React Native — ნავიგაციის სტრუქტურა (Expo Router) | ✅ | ❌ |
| React Native — ავტორიზაცია (email, Google, phone) | ✅ | ❌ |
| React Native — ბიბლიოთეკის ეკრანი | ✅ | ❌ |
| React Native — Mobile Reader + სანიშნეები, შენიშვნები | ✅ | ❌ |
| React Native — Dark mode (ThemeContext + toggle) | ✅ | ❌ |
| React Native — წიგნის დეტალების გვერდი | ✅ | ❌ |
| React Native — კითხვის სინქრონიზაცია ვებთან | ✅ | ❌ |
| PWA setup (manifest, service worker, offline cache) | ✅ | ❌ |
| PWA icons (icon-192, icon-512, favicon) | ✅ | ❌ |
| Mobile assets (icon, splash, adaptive-icon) | ✅ | ❌ |

---

## ფაზა 6: ხმოვანი წაკითხვა (TTS Service) ✅
**მიზანი:** წიგნის ხმოვანი წაკითხვის სრული სისტემა

### ამოცანები:
| ამოცანა | სტატუსი | დატესტილია |
|---|---|---|
| TTS Module სტრუქტურა (tts.module.ts, service, controller, processor) | ✅ | ✅ |
| DB მოდელები — AudioBook, AudioChapter ცხრილები (Prisma) | ✅ | ✅ |
| WebSocket Gateway (tts.gateway.ts — progress events) | ✅ | ✅ |
| ElevenLabs TTS პროვაიდერი | ✅ | ✅ |
| Azure TTS პროვაიდერი (ნაწილობრივი) | ✅ | ✅ |
| ტექსტის ფრაგმენტებად დაყოფა — ქართული-aware (text-chunker.ts) | ✅ | ✅ |
| ffmpeg — ფრაგმენტების შეერთება MP3 ფაილებად (audio-concat.ts) | ✅ | ✅ |
| BullMQ — აუდიო გენერაციის job queue + processor | ✅ | ✅ |
| S3 — აუდიო ფაილების შენახვა და streaming (presigned URLs) | ✅ | ✅ |
| აუდიო caching — ერთხელ გენერირებული აუდიოს ხელახლა გამოყენება | ✅ | ✅ |
| ვებ აუდიო პლეიერი (Play/Pause, progress bar, speed, ±15s) | ✅ | ✅ |
| ვებ აუდიო პლეიერი (Sleep Timer, Media Session API) | ✅ | ✅ |
| API endpoints — synthesize, synthesize-book, status, stream, voices, delete | ✅ | ✅ |
| Google Cloud TTS API ინტეგრაცია (ქართული Neural2 ხმები) | ✅ | ✅ |
| Provider Fallback / Health-Check სისტემა (ProviderManager) | ✅ | ✅ |
| ვებ UI — ხმის არჩევა (VoiceSelector) + TTS Generation Panel | ✅ | ✅ |
| ვებ აუდიო პლეიერი (ტექსტის highlight karaoke-style) | ✅ | ✅ |
| ვებ AudioPlayer — volume, keyboard shortcuts, chapter dropdown | ✅ | ✅ |
| მობილური აუდიო პლეიერი (Background, Lock screen, Headphone) | ✅ | ✅ |
| მობილური — Offline აუდიო download & cache | ✅ | ✅ |
| ხმის პარამეტრები — ხმის preview, ფასის ესტიმაცია | ✅ | ✅ |
| Cost tracking, retry endpoint, timestamps endpoint | ✅ | ✅ |

---

## ფაზა 7: მომხმარებლის Dashboard ✅
**მიზანი:** მომხმარებლის პანელი, ბიბლიოთეკა

### ამოცანები:
| ამოცანა | სტატუსი | დატესტილია |
|---|---|---|
| Dashboard layout (stats, recent activity, quick actions) | ✅ | ❌ |
| ბიბლიოთეკის გვერდი (ნათარგმნი წიგნები, ფილტრები, ძებნა) | ✅ | ❌ |
| კითხვის პროგრესი ბიბლიოთეკაში | ✅ | ❌ |
| ფილტრები (ყველა, მიმდინარე, წაკითხული) | ✅ | ❌ |
| თარგმნის ისტორია — API | ✅ | ❌ |
| თარგმნის ისტორია — UI (data display) | ✅ | ❌ |
| გადახდების ისტორია — API | ✅ | ❌ |
| გადახდების ისტორია — UI | ✅ | ❌ |
| პროფილის რედაქტირების გვერდი | ✅ | ❌ |
| პაროლის შეცვლა | ✅ | ❌ |
| ნოტიფიკაციების პარამეტრები | ✅ | ❌ |
| Reader-ის default პარამეტრები | ✅ | ❌ |

---

## ფაზა 8: მობილური აპლიკაცია — გადმოვიდა ფაზა 5-ში ✅
> React Native აპლიკაცია ფაზა 5-ში გაერთიანდა (shared `packages/reader/` არქიტექტურით).
> App Store / Play Store პუბლიკაცია ფაზა 10-ში.

---

## ფაზა 9: Push ნოტიფიკაციები & დამატებითი Email-ები
**მიზანი:** ნოტიფიკაციების სისტემის გაფართოება

### ამოცანები:
| ამოცანა | სტატუსი | დატესტილია |
|---|---|---|
| დამატებითი email templates (თარგმნა დასრულდა, გადახდის ქვითარი) | ❌ | ❌ |
| Push notifications სერვისი (ვები + მობილური) | ❌ | ❌ |
| In-app ნოტიფიკაციები | ❌ | ❌ |

---

## ფაზა 10: პოლისინგი და ოპტიმიზაცია
**მიზანი:** ხარისხის გაუმჯობესება, ტესტირება, დეპლოი

### ამოცანები:
| ამოცანა | სტატუსი | დატესტილია |
|---|---|---|
| Unit ტესტები (Vitest, 700+) | ✅ | ❌ |
| Integration ტესტები (API) | ❌ | ❌ |
| E2E ტესტები (Playwright) | ❌ | ❌ |
| Performance ოპტიმიზაცია | ❌ | ❌ |
| SEO ოპტიმიზაცია (JSON-LD, meta tags, sitemap, robots.txt) | ✅ | ❌ |
| Accessibility (a11y) | ❌ | ❌ |
| Error tracking (Sentry) | ❌ | ❌ |
| Logging სისტემა | ❌ | ❌ |
| CI/CD pipeline (GitHub Actions) | ❌ | ❌ |
| Production deployment (Vercel + Railway) | ❌ | ❌ |
| App Store / Play Store პუბლიკაცია | ❌ | ❌ |

---

## ფაზა 11: მომავალი ფუნქციები (v2)
**მიზანი:** პლატფორმის გაფართოება

### ამოცანები:
| ამოცანა | სტატუსი | დატესტილია |
|---|---|---|
| ადმინ პანელი | ❌ | ❌ |
| დამატებითი ენების მხარდაჭერა | ❌ | ❌ |
| წიგნების რეკომენდაციის სისტემა | ❌ | ❌ |
| კომუნიტი (შეფასებები, რეცენზიები) | ❌ | ❌ |
| Offline კითხვა (მობილური) | ❌ | ❌ |
| თარგმანის რედაქტირება (split view) | ❌ | ❌ |
| წიგნების კატალოგი (ნათარგმნი წიგნების მაღაზია) | ❌ | ❌ |
| საკუთარი LLM მოდელის fine-tuning (NLLB-200 ან Llama) | ❌ | ❌ |
| Batch API ინტეგრაცია (ეკონომიური თარგმნისთვის) | ❌ | ❌ |

---

## პროგრესის შეჯამება

| ფაზა | სტატუსი | პროგრესი |
|---|---|---|
| ფაზა 1: ფუნდამენტი | ✅ დასრულებული | 100% |
| ფაზა 2: ძებნა + ატვირთვა | ✅ დასრულებული | 100% |
| ფაზა 2.5: Email/Resend | ✅ დასრულებული | 100% |
| ფაზა 3: AI თარგმნა | ✅ დასრულებული | 100% |
| ფაზა 4: გადახდა | ✅ დასრულებული | 100% |
| ფაზა 5: Reader + Mobile | ✅ დასრულებული | 100% |
| ფაზა 6: TTS | ✅ დასრულებული | 100% |
| ფაზა 7: Dashboard | ✅ დასრულებული | 100% |
| ფაზა 9: ნოტიფიკაციები | ❌ დაუწყებელი | 0% |
| ფაზა 10: პოლისინგი | 🟡 ნაწილობრივ | 20% (ტესტები + SEO) |
| ფაზა 11: v2 | ❌ დაუწყებელი | 0% |
