# Book Translator — Dashboard & ავტორიზებული მომხმარებლის გეგმა

## 1. მიმოხილვა

დალოგინებული მომხმარებლის სრული გამოცდილება: Navbar-ის ცვლილება, Dashboard გვერდი, Protected routes, AuthContext.

---

## 2. Navbar — ავტორიზებული/არაავტორიზებული მდგომარეობა

### 2.1 არაავტორიზებული (ახლანდელი)
```
[Logo] [ძებნა] [ატვირთვა]     [🌙] [KA/EN] [შესვლა] [რეგისტრაცია]
```

### 2.2 ავტორიზებული (ახალი)
```
[Logo] [ძებნა] [ატვირთვა]     [🌙] [KA/EN] [🔔 3] [ჩემი პროფილი ▾]
```

**NotificationBell (🔔):**
- Bell icon + წითელი badge წაუკითხავი count-ით
- Click → NotificationCenter dropdown (scrollable სია, max-height 440px)
- Header: "შეტყობინებები" + "ყველას წაკითხულად მონიშვნა"
- Item: სათაური, ტექსტი, რელატიური დრო, read/unread dot
- Click notification → navigate + mark as read
- Real-time: Socket.IO `/notifications` namespace
- Toast popup ახალი შეტყობინებისას (bottom-right, 5s auto-dismiss)

### 2.3 Dropdown მენიუ
```
┌─────────────────────────────┐
│  👤 მომხმარებლის სახელი     │
│     user@email.com          │
├─────────────────────────────┤
│  📊  Dashboard              │
│  📚  ბიბლიოთეკა            │
│  🔄  თარგმნის ისტორია       │
├─────────────────────────────┤
│  ⚙️  პარამეტრები            │
│  🚪  გასვლა                 │
└─────────────────────────────┘
```

### 2.4 i18n Keys (ka/en)
| Key | ქართული | English |
|---|---|---|
| `nav.myProfile` | ჩემი პროფილი | My Profile |
| `nav.dashboard` | Dashboard | Dashboard |
| `nav.library` | ბიბლიოთეკა | Library |
| `nav.translationHistory` | თარგმნის ისტორია | Translation History |
| `nav.settings` | პარამეტრები | Settings |
| `nav.logout` | გასვლა | Log Out |

---

## 3. AuthContext / Provider

### 3.1 სტრუქტურა
```
apps/web/src/
├── context/
│   └── AuthContext.tsx       # AuthProvider + useAuth hook
├── lib/
│   └── api.ts                # API client (axios + interceptors)
├── middleware.ts              # Protected routes middleware
```

### 3.2 useAuth() Hook API
```typescript
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}
```

### 3.3 Token მართვა
- **Access Token** — `localStorage`-ში ინახება
- **Refresh Token** — `httpOnly cookie` (API-ს უბრუნებს)
- **Auto-refresh** — access token-ის ვადის გასვლისას refresh endpoint-ზე მიმართავს
- **Axios interceptor** — 401 პასუხზე auto-refresh

---

## 4. Protected Routes

### 4.1 middleware.ts (Next.js)
```
Protected routes (ავტორიზაცია საჭირო):
  /[locale]/dashboard
  /[locale]/library
  /[locale]/translations
  /[locale]/settings
  /[locale]/profile

Public routes (ყველასთვის ხელმისაწვდომი):
  /[locale]/           (landing)
  /[locale]/login
  /[locale]/register
  /[locale]/search
  /[locale]/books/[id]
  /[locale]/forgot-password
  /[locale]/reset-password
  /[locale]/verify-email
```

### 4.2 Redirect ლოგიკა
- **არაავტორიზებული → protected route:** redirect → `/login?redirect=/dashboard`
- **Login/Register შემდეგ:** redirect → `/dashboard` (ან `redirect` query param-ის მიხედვით)
- **ავტორიზებული → login/register:** redirect → `/dashboard`

---

## 5. Dashboard გვერდი (/dashboard)

### 5.1 Layout
```
┌─────────────────────────────────────────────┐
│  Navbar                                      │
├─────────────────────────────────────────────┤
│                                              │
│  გამარჯობა, [სახელი]! 👋                    │
│                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│  │ 📚 3     │ │ 🔄 1     │ │ ✅ 2     │     │
│  │ წიგნები  │ │ მიმდინარე│ │ დასრულ.  │     │
│  └──────────┘ └──────────┘ └──────────┘     │
│                                              │
│  ბოლო აქტივობა                              │
│  ├─ "ჰარი პოტერი" — 45% წაკითხული           │
│  ├─ "1984" — თარგმნა მიმდინარეობს (67%)     │
│  └─ "Dune" — თარგმნა დასრულდა              │
│                                              │
│  სწრაფი მოქმედებები                          │
│  [🔍 წიგნის ძებნა]  [📤 წიგნის ატვირთვა]    │
│                                              │
├─────────────────────────────────────────────┤
│  Footer                                      │
└─────────────────────────────────────────────┘
```

### 5.2 Dashboard სექციები
1. **მისალმება** — "გამარჯობა, [სახელი]!" + თარიღი
2. **სტატისტიკის ბარათები** — წიგნების რაოდენობა, მიმდინარე, დასრულებული
3. **ბოლო აქტივობა** — ბოლო 5 აქტივობა (კითხვა, თარგმნა, ყიდვა)
4. **სწრაფი მოქმედებები** — ძებნა, ატვირთვა ღილაკები

### 5.3 API Endpoints (უკვე არსებული)
- `GET /users/me` — პროფილის ინფორმაცია
- `GET /users/me` → მომავალში `GET /dashboard/stats` — სტატისტიკა

---

## 6. Frontend მარშრუტების რუკა

| Route | გვერდი | კომპონენტი | სტატუსი |
|---|---|---|---|
| `/[locale]` | Landing | `page.tsx` | ✅ არსებობს |
| `/[locale]/login` | შესვლა | `page.tsx` | ✅ არსებობს |
| `/[locale]/register` | რეგისტრაცია | `page.tsx` | ✅ არსებობს |
| `/[locale]/search` | ძებნა | `page.tsx` | ✅ არსებობს |
| `/[locale]/upload` | ატვირთვა | `page.tsx` | ✅ არსებობს |
| `/[locale]/books/[id]` | წიგნის დეტალები | `page.tsx` | ✅ არსებობს |
| `/[locale]/dashboard` | Dashboard | `page.tsx` | ❌ საჭიროა |
| `/[locale]/library` | ბიბლიოთეკა | `page.tsx` | ❌ საჭიროა |
| `/[locale]/translations` | თარგმნის ისტორია | `page.tsx` | ❌ საჭიროა |
| `/[locale]/settings` | პარამეტრები | `page.tsx` | ❌ საჭიროა |
| `/[locale]/forgot-password` | პაროლის აღდგენა | `page.tsx` | ❌ საჭიროა |
| `/[locale]/reset-password` | ახალი პაროლი | `page.tsx` | ❌ საჭიროა |
| `/[locale]/verify-email` | Email დადასტურება | `page.tsx` | ❌ საჭიროა |

---

## 7. იმპლემენტაციის თანმიმდევრობა

### ნაბიჯი 1: AuthContext + API Client
1. `apps/web/src/context/AuthContext.tsx` — Provider + useAuth hook
2. `apps/web/src/lib/api.ts` — Axios instance + interceptors
3. layout.tsx-ში AuthProvider-ის დამატება

### ნაბიჯი 2: Navbar განახლება
1. Navbar.tsx — ავტორიზებული/არაავტორიზებული state
2. UserDropdown კომპონენტი — dropdown მენიუ
3. i18n keys — ka.json + en.json

### ნაბიჯი 3: Protected Routes Middleware
1. middleware.ts — JWT token-ის შემოწმება
2. Redirect ლოგიკა (login → dashboard, protected → login)

### ნაბიჯი 4: Dashboard გვერდი
1. `/[locale]/dashboard/page.tsx` — მთავარი dashboard
2. სტატისტიკის ბარათები
3. ბოლო აქტივობის სია
4. სწრაფი მოქმედებების ღილაკები

### ნაბიჯი 5: Login/Register → Dashboard Redirect
1. Login გვერდის განახლება — წარმატებული login → `/dashboard`
2. Register გვერდის განახლება — წარმატებული register → `/dashboard`

---

## 7.5 Settings გვერდი — ნოტიფიკაციების პრეფერენსები (Phase 9)

Settings გვერდი (`/[locale]/settings`) განახლებულია API-backed notification preferences-ით:

### არხების კონტროლი
| Toggle | აღწერა |
|---|---|
| Email შეტყობინებები | email ნოტიფიკაციები (Resend) |
| Push შეტყობინებები | ბრაუზერის push notifications (VAPID) |
| In-App შეტყობინებები | NotificationBell + Toast |

### მოვლენების კონტროლი
| Toggle | აღწერა |
|---|---|
| თარგმანის დასრულება | TRANSLATION_COMPLETED event |
| აუდიოს მომზადება | TTS_COMPLETED event |
| გადახდის ქვითარი | PAYMENT_RECEIPT event |

### ტექნიკური დეტალები
- პრეფერენსები ინახება **სერვერზე** (`NotificationPreference` ცხრილი), არა localStorage-ში
- `GET /api/notifications/preferences` — ჩატვირთვა mount-ზე
- `PATCH /api/notifications/preferences` — auto-save toggle-ის ცვლილებაზე
- Push toggle: ბრაუზერის `Notification.requestPermission()` + API subscribe/unsubscribe
- Reader defaults კვლავ localStorage-ში (client-only)

---

## 8. ტესტირების გეგმა

### 8.1 AuthContext ტესტები (~15 ტესტი)
- ინიციალიზაცია — user null, isLoading true
- Login — წარმატებული/წარუმატებელი
- Register — წარმატებული/წარუმატებელი
- Logout — token-ის წაშლა, user null
- Token refresh — auto-refresh ლოგიკა
- useAuth hook — context-ის მიწოდება

### 8.2 Navbar ტესტები (~12 ტესტი)
- არაავტორიზებული — შესვლა/რეგისტრაცია ღილაკები ჩანს
- ავტორიზებული — "ჩემი პროფილი" ჩანს
- Dropdown — გახსნა/დახურვა
- Dropdown items — ყველა ლინკი სწორია
- Logout ღილაკი — logout ფუნქციის გამოძახება
- i18n — ქართული/ინგლისური ტექსტები

### 8.3 Dashboard გვერდის ტესტები (~10 ტესტი)
- მომხმარებლის სახელის ჩვენება
- სტატისტიკის ბარათები
- ბოლო აქტივობის სია
- Loading/Error states
- არაავტორიზებული → redirect

### 8.4 Protected Routes ტესტები (~8 ტესტი)
- Protected route + არაავტორიზებული → login redirect
- Protected route + ავტორიზებული → გვერდის ჩვენება
- Login/Register + ავტორიზებული → dashboard redirect
- Redirect query param-ის შენარჩუნება

### სულ: ~45 ახალი ტესტი

---

## 9. ThemeSwitcher Console Error (ცნობილი ბაგი)

### პრობლემა
```
Encountered a script tag while rendering React component.
src/app/[locale]/layout.tsx (36:9) @ LocaleLayout
```

### მიზეზი
`<script dangerouslySetInnerHTML={{ __html: themeScript }} />` React-ის client-side rendering-ის დროს არ სრულდება. ენის გადართვისას ხდება re-render და თემა იკარგება.

### გამოსწორება
`themeScript` უნდა გადავიტანოთ `next/script`-ზე `strategy="beforeInteractive"`-ით, ან `useEffect`-ში შევასრულოთ.

---

## 10. Login ფორმის გაუმჯობესებები

### 10.1 პაროლის ხილვადობის Toggle
- 👁️ აიკონი password input-ის მარჯვენა მხარეს
- დაკლიკებით: `type="password"` ↔ `type="text"`
- აიკონი: 👁️ (ხილული) / 👁️‍🗨️ (დაფარული)

### 10.2 "დაგავიწყდათ პაროლი?" ლინკი
- პაროლის ველის ქვემოთ
- მიმართულება: `/forgot-password`
