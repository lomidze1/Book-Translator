# Production-მდე გასაკეთებელი საქმეები

## 1. Google OAuth — Publish App
- **სტატუსი:** Testing (მხოლოდ test users-ისთვის მუშაობს)
- **რა უნდა გაკეთდეს:** Google Cloud Console → Google Auth Platform → Audience → **"Publish app"**
- **რა მოითხოვს Google:**
  - Privacy Policy URL (მაგ. `https://booktranslator.ge/privacy`)
  - Terms of Service URL (მაგ. `https://booktranslator.ge/terms`)
  - App logo
  - Homepage URL
- **Publish-ის შემდეგ:** ყველა Google ანგარიშის მფლობელი შეძლებს Sign in with Google-ს
- **Google Console URL:** https://console.cloud.google.com/auth/audience?project=spring-melody-412619

## 2. Google OAuth — Production Domain
- Authorized JavaScript origins-ში დაამატე production domain (მაგ. `https://booktranslator.ge`)
- Authorized redirect URIs-შიც იგივე domain
- **Google Console URL:** https://console.cloud.google.com/auth/clients?project=spring-melody-412619

## 3. დომეინის შეძენა და კონფიგურაცია
- დომეინის არჩევა და შეძენა
- DNS კონფიგურაცია (Vercel + Railway)
- SSL სერტიფიკატი (ავტომატური Vercel/Railway-ზე)

## 4. Environment Variables (Production)
- API: DATABASE_URL, REDIS_URL, JWT_SECRET, JWT_REFRESH_SECRET
- API: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET
- API: ANTHROPIC_API_KEY (Claude API)
- API: GOOGLE_CLIENT_ID (OAuth)
- API: GOOGLE_CLOUD_TTS_KEY (TTS)
- API: RESEND_API_KEY (Email)
- API: FLITT_MERCHANT_ID, FLITT_SECRET_KEY (Payments)
- API: SENTRY_DSN
- API: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (Web Push)
- Web: NEXT_PUBLIC_API_URL, NEXT_PUBLIC_GOOGLE_CLIENT_ID
- Web: NEXT_PUBLIC_VAPID_PUBLIC_KEY
- Web: NEXT_PUBLIC_SENTRY_DSN

## 5. Email (Resend)
- Production domain-ის ვერიფიკაცია Resend-ში
- DNS records (SPF, DKIM, DMARC) კონფიგურაცია
- sender address: `noreply@booktranslator.ge`

## 6. VAPID Keys (Web Push)
- `npx web-push generate-vapid-keys` — production keys-ის გენერაცია
- .env-ში დამატება (API + Web)

## 7. AWS S3 (Production)
- Production bucket-ის შექმნა
- CORS policy კონფიგურაცია
- IAM user/policy production-ისთვის

## 8. Payment Provider — Flitt Production Credentials
- Flitt (TBC Bank subsidiary) production merchant_id + secret_key
- Webhook URL-ის დარეგისტრირება Flitt-ის dashboard-ში: `https://<api-domain>/api/payments/flitt/callback`
- Server IP allowlist (Flitt callback servers): `54.154.216.60`, `3.75.125.89`
- Docs: https://docs.flitt.com/getting-started/redirect

## 9. Sentry — Production
- Production project-ის შექმნა (API + Web)
- DSN-ების კონფიგურაცია

## 10. App Store / Play Store პუბლიკაცია
- React Native აპის build (iOS + Android)
- App Store review submission
- Play Store review submission
