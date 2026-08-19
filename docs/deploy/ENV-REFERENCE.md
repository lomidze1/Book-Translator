# Deploy — env ცვლადების ცნობარი

> ფაზა 2.1 / 2.2-ის მოსამზადებელი მასალა. აქ არის ყველა ცვლადი, რაც Railway-ს (API)
> და Vercel-ს (web) სჭირდება: რომელი რას აკეთებს, რომელია საიდუმლო და რომელი არა.
>
> **`<DOMAIN>`** — ჩაანაცვლე არჩეული დომენით (მაგ. `booktranslator.ge`).
> დომენი ჯერ არჩეული არაა, ამიტომ ყველგან placeholder-ია.

---

## Railway — API სერვისი

### არა-საიდუმლო (CLI-ით დაყენებადი — მე გავაკეთებ)

```bash
railway variables --set NODE_ENV=production
railway variables --set PORT=4000
railway variables --set CORS_ORIGIN=https://<DOMAIN>
railway variables --set FRONTEND_URL=https://<DOMAIN>
railway variables --set API_URL=https://api.<DOMAIN>

railway variables --set CLAUDE_MODEL=claude-sonnet-5
railway variables --set GEMINI_JUDGE_MODEL=gemini-2.5-pro

railway variables --set PRICE_PER_PAGE_FAST=0.15
railway variables --set PRICE_PER_PAGE_SLOW=0.07
railway variables --set PRICE_MIN=10
railway variables --set PRICE_EXISTING=5
railway variables --set PRICE_CURRENCY=GEL

railway variables --set ENABLE_PREVIEW=true
railway variables --set ENABLE_TTS=false
railway variables --set ENABLE_BOOK_RESALE=false
railway variables --set PREVIEW_DAILY_LIMIT=3
railway variables --set PREVIEW_MAX_CONCURRENT_JOBS=2

railway variables --set AWS_REGION=eu-central-1
railway variables --set AWS_S3_BUCKET=<bucket-name>
railway variables --set EMAIL_FROM=noreply@<DOMAIN>
railway variables --set VAPID_SUBJECT=mailto:support@<DOMAIN>
```

`ENABLE_DEV_SHORTCUTS` **საერთოდ არ დააყენო** — auth bypass-ია.
TTS-ის ცვლადები არ გვჭირდება სანამ `ENABLE_TTS=false`-ია.

### Reference ცვლადები (Railway თვითონ აბამს სერვისებზე)

| ცვლადი | წყარო |
|---|---|
| `DATABASE_URL` | Postgres სერვისი → `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | Redis სერვისი → `${{Redis.REDIS_URL}}` |

`REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` არ დაგჭირდება — კოდი `REDIS_URL`-ს
კითხულობს, თუ მითითებულია.

### საიდუმლოები (მხოლოდ შენ — Railway dashboard-ში)

| ცვლადი | კომენტარი |
|---|---|
| `JWT_ACCESS_SECRET` | `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | `openssl rand -base64 48` (ცალკე მნიშვნელობა!) |
| `AWS_ACCESS_KEY_ID` | IAM user მხოლოდ S3 bucket-ის უფლებით |
| `AWS_SECRET_ACCESS_KEY` | იგივე IAM user |
| `ANTHROPIC_API_KEY` | console.anthropic.com, billing limit-ით |
| `GEMINI_API_KEY` | aistudio.google.com (არჩევითი) |
| `GOOGLE_BOOKS_API_KEY` | არჩევითი — ამის გარეშე Google ძებნას მკაცრად ლიმიტავს |
| `RESEND_API_KEY` | resend.com + დომენის ვერიფიკაცია |
| `FLITT_MERCHANT_ID` | Flitt მერჩანტ ხელშეკრულება |
| `FLITT_SECRET_KEY` | იგივე |
| `GOOGLE_CLIENT_ID` | Google Cloud Console OAuth client |
| `VAPID_PUBLIC_KEY` | `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | იგივე ბრძანების მეორე მნიშვნელობა |
| `SENTRY_DSN` | sentry.io — API პროექტი |
| `INITIAL_ADMIN_EMAIL` | შენი ადმინ ემეილი |

`GOOGLE_CLIENT_SECRET` **არ გვჭირდება** — API კოდი მას არ კითხულობს.

გასაღებების გენერაციის ბრძანებები:

```bash
openssl rand -base64 48
```

```bash
npx web-push generate-vapid-keys
```

---

## Vercel — web აპლიკაცია

Root Directory: `apps/web` · Framework: Next.js

| ცვლადი | მნიშვნელობა | საიდუმლო? |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.<DOMAIN>` | არა |
| `NEXT_PUBLIC_SITE_URL` | `https://<DOMAIN>` | არა |
| `NEXT_PUBLIC_ENABLE_PREVIEW` | `true` (API-ს `ENABLE_PREVIEW`-ს დაემთხვეს!) | არა |
| `NEXT_PUBLIC_ENABLE_TTS` | `false` (API-ს `ENABLE_TTS`-ს დაემთხვეს!) | არა |
| `NEXT_PUBLIC_TWITTER_HANDLE` | არჩევითი, OG card-ისთვის | არა |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Railway-ს `GOOGLE_CLIENT_ID`-ის იგივე მნიშვნელობა | არა (public-ია) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Railway-ს `VAPID_PUBLIC_KEY`-ის იგივე | არა (public-ია) |
| `NEXT_PUBLIC_SENTRY_DSN` | sentry.io — web პროექტი | არა |
| `SENTRY_AUTH_TOKEN` | sourcemap-ების ატვირთვისთვის | **დიახ** |
| `SENTRY_ORG` | sentry.io org slug | არა |
| `SENTRY_PROJECT` | sentry.io project slug | არა |

⚠️ ყველა `NEXT_PUBLIC_*` **build-ისას იბეჭდება** bundle-ში. მნიშვნელობის შეცვლა
მოითხოვს rebuild-ს, არა უბრალოდ restart-ს.

⚠️ Preview deployment-ების დომენები `CORS_ORIGIN`-ში არ იქნება, ამიტომ preview-ებზე
auth არ იმუშავებს. ეს მოსალოდნელია.

---

## DNS

| ჩანაწერი | მიმართულება |
|---|---|
| `<DOMAIN>` | Vercel (A/CNAME — Vercel-ის ინსტრუქციით) |
| `api.<DOMAIN>` | Railway (CNAME) |
| SPF / DKIM | Resend-ის ინსტრუქციით (ემეილის მიწოდებისთვის სავალდებულოა) |

თუ DNS-ის წინ Cloudflare proxy ჩაირთვება, API-ში `trust proxy` 1 → 2 ჰოპზე უნდა
გადავაწყო (`apps/api/src/main.ts`).
