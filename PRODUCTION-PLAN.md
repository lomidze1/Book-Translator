# Production Launch Plan — Book Translator

> შედგენილია: 2026-08-19 · წყარო: სამი პარალელური კოდბეიზ-აუდიტი (API runtime, Web deployability, Monorepo/CI)
> არქიტექტურა: **Vercel** (Next.js web) + **Railway** (NestJS API + PostgreSQL + Redis) + **EAS** (mobile, მოგვიანებით)
>
> სტატუსის აღნიშვნები: ⬜ გასაკეთებელი · ✅ გაკეთებული · 🔴 ბლოკერი (ამის გარეშე deploy ვერ მოხდება)

---

## ფაზა 0 — კოდის გასწორებები deploy-მდე

### CLAUDE-PART (ვაკეთებ მე, ამ რეპოში)

#### 0.1 🔴 `apps/api/Dockerfile` — სრული გასწორება
აუდიტმა აჩვენა, რომ Dockerfile-ს არასდროს აუწყვია მუშა კონტეინერი. გასასწორებელია ოთხივე ბაგი:

- ✅ **Bug A — lockfile check ჩავარდება:** `pnpm install --frozen-lockfile` ელოდება ექვსივე workspace importer-ს, Dockerfile კი მხოლოდ 4 manifest-ს აკოპირებს (`packages/reader/package.json` აკლია, `apps/web`/`apps/mobile` საერთოდ). გამოსავალი: `pnpm deploy --legacy --filter @book-translator/api` მიდგომა ან ყველა manifest-ის კოპირება + `--filter api...` install.
- ✅ **Bug B — `--ignore-scripts` ტეხავს `bcrypt`-ს:** native მოდულია, postinstall სჭირდება (`pnpm-workspace.yaml`-ის `onlyBuiltDependencies` allowlist-ს `--ignore-scripts` აუქმებს). Login საერთოდ ვერ იმუშავებდა. გამოსავალი: scripts-ის დაშვება allowlist-ით + builder image-ში build toolchain (ან musl-compatible prebuilt-ის უზრუნველყოფა).
- ✅ **Bug C — runtime stage-ში `node_modules` არასწორ ადგილასაა:** `apps_node_modules` დირექტორიას Node არასდროს ეძებს, თანაც pnpm-ის symlink-ები გადატანისას ტყდება → `MODULE_NOT_FOUND: @nestjs/core`. გამოსავალი: `pnpm deploy`-ს self-contained output ან `node_modules`-ის სწორი layout (`apps/api/node_modules` + `.pnpm` store ერთად).
- ✅ **Bug D — root `.dockerignore` არ არსებობს:** `apps/api/.dockerignore` context root-იდან არ იკითხება და უქმია. შესაქმნელია root `.dockerignore` (node_modules, dist, .git, .env*, coverage, apps/mobile/dist და ა.შ.).
- ✅ **ვერიფიკაცია:** ლოკალურად `docker build -f apps/api/Dockerfile .` + კონტეინერის გაშვება docker-compose-ის Postgres/Redis-თან → `GET /api` health-ის პასუხი + login-ის მუშაობა (bcrypt-ის შემოწმება). **სანამ ეს ლოკალურად არ ამუშავდება, Railway-ზე არ ავდივართ.**

#### 0.2 🔴 Graceful shutdown — API
- ✅ `app.enableShutdownHooks()` დამატება `apps/api/src/main.ts`-ში.
- ✅ `OnModuleDestroy` + `worker.close()` იმ სამ processor-ში, რომლებსაც საერთოდ არ აქვთ: `translation.processor.ts`, `editor-batch.processor.ts`, `retranslation.processor.ts` (tts/preview/notification processor-ებს უკვე აქვთ).
- ✅ ვერიფიკაცია: SIGTERM-ზე კონტეინერი <1 წამში სუფთად ჩერდება (exit 0), ექვსივე worker იხურება. **დამატებით აღმოჩენილი:** სამ სერვისს (`translation`, `notification`, `preview`) BullMQ Queue-ები ღია რჩებოდა და პროცესს event loop-ში აჭერდა — მათაც დაემატა `onModuleDestroy`. Dockerfile-ის CMD-ს `exec` დაემატა, რომ node იყოს PID 1.

#### 0.3 🔴 Web security headers — `apps/web/next.config.ts`
- ✅ `headers()` ფუნქციის დამატება: `Strict-Transport-Security` (HSTS), `X-Frame-Options: DENY` (ან frame-ancestors), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`.
- ✅ **CSP** — Report-Only რეჟიმში დასაწყებად (Next.js inline script-ების და Google OAuth/Flitt redirect-ების გამო ფრთხილად), მერე enforcing.
- ✅ ვერიფიკაცია: ლოკალური build + header-ების შემოწმება response-ებში.

#### 0.4 პაკეტების მოწესრიგება (გადაწყვეტილება: shared რჩება, config იშლება)
- ✅ `packages/config` წაშლა — 0 მომხმარებელი, რეალური კონფიგი root-შია (`tsconfig.base.json`, `.eslintrc.js`, `.prettierrc`). CI-დან და Dockerfile-დან მისი ხსენების ამოღება.
- ✅ `packages/shared` **წაშლილია** (გადაწყვეტილება შეიცვალა). გადამოწმებისას აღმოჩნდა, რომ 183 ხაზი 0 მომხმარებლის გარდა მოძველებულიც იყო: `JWT.REFRESH_EXPIRY: '30d'` (რეალურად `'7d'`), `AuthResponse`-ში `refreshToken` body-ში (რეალურად httpOnly cookie-შია), hardcoded ფასები env-ის ნაცვლად. ანუ მისი მიღება ბაგებს შემოიტანდა.
- ✅ CI-დან `shared`-ის ცალკე lint საფეხურის მოხსნა მანამ, სანამ პაკეტს რეალური მომხმარებელი არ ეყოლება.

#### 0.5 Env ცვლადების დოკუმენტირება
- ✅ `apps/api/.env.example`-ში 8 აღუწერელი ცვლადის დამატება: `REDIS_PASSWORD`, `GOOGLE_BOOKS_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`, `ENABLE_DEV_SHORTCUTS`, `TTS_HEALTH_CHECK_INTERVAL_MS`, `TTS_CHUNK_MAX_BYTES`, `TTS_CHUNK_MAX_BYTES_GOOGLE`, `CLAUDE_INPUT_USD_PER_MTOK` / `CLAUDE_OUTPUT_USD_PER_MTOK` / `CLAUDE_BLENDED_USD_PER_MTOK`.
- ✅ `GOOGLE_CLIENT_SECRET`-ის შენიშვნა (API კოდი არ კითხულობს — მხოლოდ `GOOGLE_CLIENT_ID` გამოიყენება ID-token ვერიფიკაციისთვის).

#### 0.6 წვრილმანი გამაგრებები (არა-ბლოკერი, მაგრამ ახლავე ღირს)
- ✅ Flitt callback route-ის გამორიცხვა საერთო throttle bucket-იდან (`@SkipThrottle` `payment.controller.ts`-ის callback endpoint-ზე) — ბანკის burst-მა 429 არ მიიღოს.
- ✅ Health endpoint-ის გაღრმავება: `GET /api`-ს დაემატოს DB (`SELECT 1`) და Redis ping — Railway healthcheck-მა რეალური მდგომარეობა დაინახოს.
- ✅ `turbo.json`: web-ის `outputs`-ში `.next/**`-ის დამატება (ახლა `dist/**`-ია და cache hit ცარიელ build-ს აბრუნებს); `env` გასაღებების დეკლარირება (`NEXT_PUBLIC_*`), რომ env-ის ცვლილება cache-ს არ გამორჩეს.
- ✅ `AuthContext.tsx`-ის ორი პირდაპირი `process.env.NEXT_PUBLIC_API_URL` წაკითხვის ცენტრალიზება `api-client.ts`-ის `API_URL`-ზე.
- ✅ CLAUDE.md-ის მოძველებული ხაზის გასწორება („BOG Pay, TBC Pay" → Flitt).

#### 0.7 ტესტები და commit
- ✅ `cd apps/api && npx vitest run` — მთელი suite მწვანე.
- ✅ `npx tsc --noEmit` სამივე აპში.
- ⬜ Commit + push `dev` → merge `main` (Giorgi-ს დასტურით).

---

## ფაზა 1 — ინფრასტრუქტურა და საიდუმლოები

### GIORGI-PART (მხოლოდ შენ შეგიძლია)

#### 1.1 🔴 დომენი
- ⬜ `booktranslator.ge`-ს რეგისტრაცია (nic.ge) — **ჯერ არ არის დარეგისტრირებული!** კოდში (sitemap, canonical, OG, mobile deep links) ეს დომენი ყველგან ჩაშენებულია, ამიტომ ეს კონკრეტული სახელი გვჭირდება.
- ⬜ გადაწყვეტილება ჩემთან ერთად: web → `booktranslator.ge` (Vercel), API → `api.booktranslator.ge` (Railway). Same parent domain = refresh cookie-ს cross-site თავსატეხი იხსნება.

#### 1.2 🔴 საიდუმლოების შეგროვება (17 ცალი — შენ ქმნი/იღებ, შენვე შეიყვან Railway/Vercel-ში)
> API key-ების და პაროლების შეყვანა ჩემგან აკრძალულია — ეს ნაწილი მთლიანად შენია. მე მოგცემ ზუსტ სიას და თითოეულის მიღების ინსტრუქციას.

| # | საიდუმლო | საიდან |
|---|---|---|
| 1 | `JWT_ACCESS_SECRET` | დაგიგენერირებ ბრძანებას (`openssl rand -base64 48`) — მნიშვნელობა შენ გადაიტანე |
| 2 | `JWT_REFRESH_SECRET` | იგივე, ცალკე მნიშვნელობა |
| 3 | `DATABASE_URL` | Railway Postgres-ის შექმნისას თვითონ ჩაისმება (reference variable) |
| 4 | `REDIS_URL` | Railway Redis-ისგან, ასევე reference-ით |
| 5-6 | `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | AWS IAM user მხოლოდ S3 uploads bucket-ის უფლებით |
| 7 | `ANTHROPIC_API_KEY` | console.anthropic.com — production key, billing limit-ით |
| 8 | `GEMINI_API_KEY` | aistudio.google.com (თარგმანის ხარისხის judge — არჩევითი, მაგრამ გვაქვს ჩართული) |
| 9 | `RESEND_API_KEY` | resend.com + **დომენის ვერიფიკაცია** (SPF/DKIM DNS ჩანაწერები), `EMAIL_FROM` რეალურ დომენზე |
| 10-11 | `FLITT_MERCHANT_ID` / `FLITT_SECRET_KEY` | Flitt-ის production მერჩანტ ხელშეკრულება — **ყველაზე გრძელი პროცესი, დაიწყე ადრე** |
| 12 | `GOOGLE_CLIENT_ID` | Google Cloud Console → OAuth client: production redirect URI-ები + consent screen-ის Publish (ეს OAuth-ის ის ბლოკერიცაა, რაც legal გვერდებს ელოდებოდა — გვერდები უკვე გვაქვს) |
| 13-14 | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | დაგიგენერირებ ბრძანებას (`npx web-push generate-vapid-keys`) — მნიშვნელობები შენ გადაიტანე |
| 15 | `SENTRY_DSN` (api) | sentry.io — API პროექტი |
| 16 | `NEXT_PUBLIC_SENTRY_DSN` (+ `SENTRY_AUTH_TOKEN`/`ORG`/`PROJECT` sourcemap-ებისთვის) | sentry.io — web პროექტი |
| 17 | `INITIAL_ADMIN_EMAIL` | შენი ადმინ ემეილი (საიდუმლო არაა, მაგრამ შენი გადასაწყვეტია) |

- ⬜ **TTS საიდუმლოები (Google Cloud SA JSON, ElevenLabs, Azure) ჯერ არ გვჭირდება** — `ENABLE_TTS=false` launch-ზე. ცალკე ეტაპად.
- ⬜ Flag-ების საბოლოო გადაწყვეტილება: `ENABLE_PREVIEW` — გირჩევ `true` (კონვერსიისთვის), `ENABLE_TTS=false`, `ENABLE_BOOK_RESALE=false` (უცვლელი), `ENABLE_DEV_SHORTCUTS` — **არასდროს** production-ში.

#### 1.3 🔴 ანგარიშები და billing
- ⬜ Railway: billing/გეგმის გააქტიურება (Hobby $5/თვე საწყისად საკმარისია; usage-based მოხმარება ზემოდან).
- ⬜ Vercel: ანგარიში + GitHub repo-ს დაკავშირება (Hobby free საკმარისია დასაწყისში; კომერციული პროექტისთვის მოგვიანებით Pro).
- ⬜ AWS: S3 bucket production-ისთვის (`eu-central-1` ან ახლო რეგიონი) + lifecycle policy გადაწყვეტილება.

---

## ფაზა 2 — Deploy

### CLAUDE-PART (CLI-ით, შენ თვალყურს ადევნებ)

#### 2.1 Railway (CLI უკვე დალოგინებულია)
- ⬜ `railway init` — პროექტის შექმნა + `railway link` რეპოსთან.
- ⬜ PostgreSQL 16 და Redis 7 სერვისების დამატება.
- ⬜ API სერვისის შექმნა GitHub repo-დან, `main` branch, `railway.toml`-ის კონფიგით (Dockerfile build, healthcheck `/api`).
> **მომზადებულია:** ყველა ცვლადის ზუსტი სია და მნიშვნელობა — [docs/deploy/ENV-REFERENCE.md](docs/deploy/ENV-REFERENCE.md)

- ⬜ არა-საიდუმლო env ცვლადების დაყენება CLI-ით: `NODE_ENV=production`, `PORT=4000`, `CORS_ORIGIN=https://booktranslator.ge`, `FRONTEND_URL`, `API_URL`, `PRICE_*` (5 ცალი), `ENABLE_*` flag-ები, `EMAIL_FROM`, `AWS_REGION`, `AWS_S3_BUCKET`, `CLAUDE_MODEL`, `VAPID_SUBJECT` და დანარჩენი კონფიგი `.env.example`-ის მიხედვით.
- ⬜ `DATABASE_URL`/`REDIS_URL` — Railway reference variables-ით Postgres/Redis სერვისებზე.
- ⬜ **[GIORGI]** ⬜ 17 საიდუმლოს შეყვანა Railway dashboard-ში (ფაზა 1.2-ის სია).
- ⬜ პირველი deploy → ლოგებში `prisma migrate deploy`-ის წარმატების და healthcheck-ის გადამოწმება (`railway logs`).
- ⬜ **მხოლოდ 1 ინსტანსი** — Socket.IO-ს Redis adapter არ აქვს და throttler in-memory-ა; scaling მოგვიანებით (იხ. ფაზა 4).

#### 2.2 Vercel
- ⬜ **[GIORGI]** ⬜ Vercel-ზე პროექტის შექმნა GitHub repo-დან: Root Directory = `apps/web`, Framework = Next.js (monorepo-ს Vercel თვითონ ხვდება pnpm workspace-ით).
- ⬜ Build env ცვლადების სია და მნიშვნელობები (მე ვამზადებ, საიდუმლოებს შენ შეიყვან): `NEXT_PUBLIC_API_URL=https://api.booktranslator.ge`, `NEXT_PUBLIC_SITE_URL=https://booktranslator.ge`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_ENABLE_TTS=false`, `NEXT_PUBLIC_ENABLE_PREVIEW` (API-ს flag-ს დაემთხვეს!), `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT`.
- ⬜ გასათვალისწინებელი: ყველა `NEXT_PUBLIC_*` **build-ისას იბეჭდება** — ცვლილება = rebuild. Preview deployment-ების domain-ები `CORS_ORIGIN`-ში არ იქნება → preview-ებზე auth არ იმუშავებს (ცნობილი შეზღუდვა, პრობლემა არაა).

#### 2.3 DNS (Giorgi ქმნის ჩანაწერებს, მე ვაძლევ ზუსტ მნიშვნელობებს)
- ⬜ **[GIORGI]** `booktranslator.ge` → Vercel (A/CNAME, Vercel-ის ინსტრუქციით), `api.booktranslator.ge` → Railway (CNAME), Resend-ის SPF/DKIM ჩანაწერები.
- ⬜ SSL ორივე პლატფორმაზე ავტომატურია — გადავამოწმებ.
- ⬜ Cloudflare proxy თუ ჩაერთვება DNS-ის წინ: `trust proxy` 1 → 2 ჰოპზე გადაწყობა API-ში (შევცვლი საჭიროებისას).

---

## ფაზა 3 — ვერიფიკაცია (launch-ის დღეს)

### CLAUDE-PART
- ⬜ Smoke test browser-ით სრულ production flow-ზე: რეგისტრაცია (ემეილის ვერიფიკაცია Resend-ით) → login → წიგნის ატვირთვა (PDF) → თარგმანის ყიდვის flow Flitt redirect-მდე → preview → reader (bookmarks/highlights/notes) → პაროლის აღდგენა → logout/login → Google OAuth.
- ⬜ WebSocket ნოტიფიკაციების შემოწმება production დომენზე (CORS!).
- ⬜ Sentry-ში ტესტ-ერორის გაგზავნა და მიღების დადასტურება (API + web).
- ⬜ `railway logs`-ის მონიტორინგი პირველი რეალური თარგმნის job-ზე ბოლომდე (საათობითაა — ლოგებში პროგრესის და დასრულების დადასტურება).
- ⬜ SEO: `https://booktranslator.ge/sitemap.xml` და `robots.txt` მუშაობს (sitemap API-ს წვდომაზეა დამოკიდებული — გადამოწმება production ქსელიდან), Search Console-ში submit **[GIORGI]**.
- ⬜ Rate limit-ების ქცევა production-ში (NODE_ENV=production-ზე რეალური ლიმიტები ირთვება — 100/წთ default, 5/15წთ upload).

### GIORGI-PART
- ⬜ Flitt-ის **რეალური საცდელი გადახდა** მცირე თანხით — callback-ის მიღების და `COMPLETED` სტატუსის დადასტურება (გადახდას შენ აკეთებ, შედეგს ერთად ვამოწმებთ).
- ⬜ საბოლოო go/no-go.

---

## ფაზა 4 — Post-launch (არა-გადაუდებელი, პრიორიტეტის მიხედვით)

- ✅ ~~`packages/shared`-ის ამუშავება~~ — პაკეტი წაშლილია (იხ. 0.4). თუ მოგვიანებით საერთო API-კონტრაქტის ტიპები დაგვჭირდა, ისინი API-დან უნდა დაგენერირდეს, არა ხელით შენახული ასლი. [CLAUDE]
- ✅ CI-ის გაძლიერება: Docker image-ის build CI-ში, `packages/reader` + mobile ტესტები, web lint, mobile lint/tsc. (install-ების `--filter`-ით დაჩქარება ⬜ — CI-ს ჯერ სრული workspace სჭირდება web build-ისთვის.) [CLAUDE]
- ⬜ CSP Report-Only → enforcing გადაყვანა რეპორტების ანალიზის შემდეგ. [CLAUDE]
- ⬜ ბაზის backup სტრატეგიის გადამოწმება Railway-ზე + აღდგენის ტესტი. [CLAUDE + GIORGI]
- ⬜ Scaling-ის წინაპირობები (როცა დაჭირდება): Socket.IO Redis adapter, Redis-backed throttler storage, BullMQ worker-ების ცალკე პროცესად გამოყოფა. [CLAUDE]
- ⬜ TTS-ის ჩართვა: Google Cloud SA + ElevenLabs/Azure საიდუმლოები, `ENABLE_TTS=true` ორივე მხარეს. [GIORGI საიდუმლოები, CLAUDE კონფიგი]
- ⬜ Mobile release: EAS placeholder-ების შევსება (`projectId`, `appleId`, `ascAppId`, `appleTeamId`, `google-play-service-account.json`), Apple Developer ($99/წ) + Play Console ($25) ანგარიშები, EAS build + submit. [GIORGI ანგარიშები/credentials, CLAUDE build კონფიგი]
- ✅ მკვდარი i18n გასაღებების გაწმენდა — 61 გასაღები ორივე ლოკალიდან (746 → 685). [CLAUDE]

---

## შეჯამება: ვინ რას აკეთებს

**CLAUDE (კოდი + CLI):** Dockerfile-ის გასწორება და ლოკალური ვერიფიკაცია, graceful shutdown, security headers, პაკეტების მოწესრიგება, env დოკუმენტაცია, Flitt throttle/health/turbo წვრილმანები, Railway-ს პროექტის აწყობა CLI-ით, არა-საიდუმლო კონფიგი, deploy-ლოგების კონტროლი, სრული smoke test, post-launch გაუმჯობესებები.

**GIORGI (ანგარიშები + საიდუმლოები + ფული):** დომენის რეგისტრაცია და DNS, 17 საიდუმლოს მიღება/შეყვანა, Railway/Vercel/AWS billing, Google OAuth consent-ის გამოქვეყნება, Resend დომენ-ვერიფიკაცია, Flitt მერჩანტ ხელშეკრულება (ყველაზე ნელი — დაიწყე პირველი!), საცდელი რეალური გადახდა, საბოლოო go/no-go.

**კრიტიკული გზა (ეს თანმიმდევრობა გვაფერხებს):** Flitt ხელშეკრულება → დომენი → ფაზა 0-ის კოდი → Railway/Vercel setup → DNS → smoke test → launch.
