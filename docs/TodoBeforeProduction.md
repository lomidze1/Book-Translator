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

## 3. App Store / Play Store პუბლიკაცია
- React Native აპის პუბლიკაცია (ფაზა 10-ის ბოლო ამოცანა)

## 4. დომეინის შეძენა
- დომეინის არჩევა და შეძენა
- DNS კონფიგურაცია
- SSL სერტიფიკატი
