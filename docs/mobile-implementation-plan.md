# Mobile App — სრული იმპლემენტაციის გეგმა

> Web → Mobile სინქრონიზაცია — 7 ფაზა, დეტალური ტასკები და ტესტები

---

## მიმდინარე მდგომარეობა (Baseline)

### ✅ უკვე იმპლემენტირებული
- Auth: login, register, forgot-password, reset-password
- Tab navigation: library, search, profile
- Book details (`/book/[id]`)
- Reader: text + bookmarks + notes + progress tracking
- Audio player: mini + fullscreen + offline cache + sleep timer
- Theme: light/dark/system (ThemeContext + AsyncStorage)
- API service: token refresh, error handling
- Georgian localization (hardcoded strings)

### ❌ აკლია Web-თან შედარებით
- i18n (ka/en switch)
- Toast notification system
- Google OAuth
- Email verification
- Change password (in-app)
- Dashboard (stats, activity)
- Settings page
- Upload (file picker)
- Payment (BOG/TBC)
- Notifications (push + WebSocket)
- Highlights (reader)
- Favorites
- Payment/Translation history
- Sentry monitoring
- Deep linking

---

## ფაზა 1 — ინფრასტრუქტურა (Foundation)

### 1.1 — i18n სისტემის დანერგვა

**მიზანი:** ქართული/ინგლისური ენის გადართვა, Web-ის message structure-ის გაზიარება

#### ფაილები შესაქმნელი:
```
apps/mobile/
├── src/
│   ├── i18n/
│   │   ├── index.ts              # i18n კონფიგურაცია (expo-localization + i18n-js)
│   │   ├── locales/
│   │   │   ├── ka.json           # ქართული თარგმანები (mobile-specific subset)
│   │   │   └── en.json           # ინგლისური თარგმანები
│   │   └── useTranslation.ts     # Custom hook: const { t, locale, setLocale } = useTranslation()
│   └── context/
│       └── LocaleContext.tsx      # Locale provider + AsyncStorage persistence
```

#### დამოკიდებულებები:
```bash
cd apps/mobile && npx expo install expo-localization i18n-js
```

#### დეტალური ამოცანები:

**1.1.1 — LocaleContext შექმნა**
```typescript
// src/context/LocaleContext.tsx
interface LocaleContextType {
  locale: 'ka' | 'en';
  setLocale: (locale: 'ka' | 'en') => void;
}
```
- AsyncStorage-ში locale შენახვა (key: `app_locale`)
- Default: მოწყობილობის ენა (expo-localization), fallback: 'ka'
- Provider wraps app in _layout.tsx

**1.1.2 — Message ფაილების შექმნა**
- Web-ის `messages/ka.json` და `messages/en.json`-დან მობილურისთვის საჭირო namespace-ების ამოღება
- საჭირო namespace-ები: `login`, `register`, `forgot_password`, `reset_password`, `search`, `library`, `profile`, `book`, `reader`, `dashboard`, `settings`, `payment`, `notifications`, `upload`, `theme`, `navbar`
- მობილური-სპეციფიკური key-ების დამატება (alert messages, tab labels)

**1.1.3 — useTranslation hook**
```typescript
// src/i18n/useTranslation.ts
export function useTranslation(namespace?: string) {
  const { locale } = useLocale();
  return {
    t: (key: string, params?: Record<string, string | number>) => string,
    locale,
  };
}
```

**1.1.4 — არსებული ეკრანების მიგრაცია**
- login.tsx: hardcoded ქართული → `t('login.title')`, `t('login.email')`, etc.
- register.tsx: ანალოგიურად
- forgot-password.tsx, reset-password.tsx
- library.tsx, search.tsx, profile.tsx
- book/[id].tsx, reader/[id].tsx
- Tab labels in (tabs)/_layout.tsx

#### ტესტები (1.1):
```
tests/i18n/
├── locale-context.test.ts        # Context provider tests
│   ├── default locale = device language or 'ka'
│   ├── setLocale persists to AsyncStorage
│   ├── reads saved locale on mount
│   └── handles invalid saved locale gracefully
├── use-translation.test.ts       # Hook tests
│   ├── returns correct translation for key
│   ├── handles nested keys (e.g., 'login.title')
│   ├── interpolates parameters correctly
│   ├── returns key itself if translation missing
│   └── switches language dynamically
└── message-completeness.test.ts  # Validation
    ├── ka.json and en.json have same keys
    ├── no empty string values
    └── all keys used in screens exist in both files
```

---

### 1.2 — Toast Notification System

**მიზანი:** In-app feedback (success, error, info) — Web-ის ToastContext-ის ანალოგი

#### ფაილები შესაქმნელი:
```
apps/mobile/src/
├── context/
│   └── ToastContext.tsx          # Toast state management
└── components/
    └── common/
        └── Toast.tsx             # Animated toast component
```

#### დეტალური ამოცანები:

**1.2.1 — ToastContext**
```typescript
interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastContextType {
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: number) => void;
}
```
- Auto-dismiss: 4000ms (shorter for mobile UX)
- Max 3 visible toasts
- FIFO overflow handling

**1.2.2 — Toast UI კომპონენტი**
- Animated slide-in from top (react-native Animated API)
- Color coding: success=#22c55e, error=#ef4444, info=#3b82f6
- Swipe-to-dismiss gesture (PanResponder)
- SafeArea-aware positioning
- Theme-aware (dark/light)
- Accessibility: accessibilityRole="alert"

**1.2.3 — ინტეგრაცია _layout.tsx-ში**
- ToastProvider wraps app after ThemeProvider
- Toast container rendered above all screens

**1.2.4 — არსებული Alert.alert() ჩანაცვლება**
- login.tsx: Alert.alert('შეცდომა', ...) → showToast(msg, 'error')
- register.tsx: ანალოგიურად
- ყველა ეკრანი სადაც Alert.alert გამოიყენება

#### ტესტები (1.2):
```
tests/toast/
├── toast-context.test.ts
│   ├── showToast adds toast to array
│   ├── auto-removes after 4000ms
│   ├── removeToast removes specific toast
│   ├── max 3 toasts at once
│   └── increments ID correctly
└── toast-component.test.ts
    ├── renders with correct color for each type
    ├── displays message text
    ├── accessible role="alert"
    └── swipe gesture triggers removal
```

---

### 1.3 — API Layer გაუმჯობესება

**მიზანი:** Centralized error handling, retry logic, offline detection

#### ფაილები შესაცვლელი/შესაქმნელი:
```
apps/mobile/src/
├── services/
│   ├── api.ts                    # ← გაუმჯობესება
│   └── network.ts                # Network status hook (NEW)
└── hooks/
    └── useNetworkStatus.ts       # Online/offline detection
```

#### დეტალური ამოცანები:

**1.3.1 — api.ts გაუმჯობესება**
- Retry logic: 3 attempts with exponential backoff (1s, 2s, 4s) — GET only
- Request timeout: 15 seconds
- Standardized error types:
```typescript
type ApiError = {
  status: number;
  message: string;
  code?: string;  // 'NETWORK_ERROR' | 'TIMEOUT' | 'UNAUTHORIZED' | 'RATE_LIMIT'
};
```

**1.3.2 — useNetworkStatus hook**
- expo NetInfo integration: `npx expo install @react-native-community/netinfo`
- Returns: `{ isConnected: boolean, isInternetReachable: boolean }`
- Offline banner component for global display

**1.3.3 — API Base URL configuration**
- Development: `EXPO_PUBLIC_API_URL` env variable
- Fallback: `http://localhost:4000`
- Production: configurable via app.json extra field

#### ტესტები (1.3):
```
tests/api/
├── api-service.test.ts
│   ├── adds auth header when token exists
│   ├── refreshes token on 401
│   ├── retries GET requests 3 times
│   ├── does not retry POST/PUT/DELETE
│   ├── throws on timeout (15s)
│   ├── throws ApiError with correct fields
│   └── handles 204 No Content
└── network-status.test.ts
    ├── returns connected state
    ├── detects offline mode
    └── updates on network change
```

---

## ფაზა 2 — Auth გაფართოება

### 2.1 — Google OAuth

**მიზანი:** Google-ით შესვლა — expo-auth-session + backend /api/auth/google

#### ფაილები შესაქმნელი:
```
apps/mobile/src/
├── services/
│   └── google-auth.ts            # Google OAuth service
└── components/
    └── common/
        └── GoogleSignInButton.tsx # Google sign-in button
```

#### დამოკიდებულებები:
```bash
npx expo install expo-auth-session expo-crypto expo-web-browser
```

#### დეტალური ამოცანები:

**2.1.1 — Google Auth Service**
```typescript
// src/services/google-auth.ts
export async function signInWithGoogle(): Promise<AuthResponse> {
  // 1. expo-auth-session: Google.useAuthRequest()
  // 2. Get idToken from Google
  // 3. POST /api/auth/google { idToken }
  // 4. Save tokens via authService.setTokens()
  // 5. Return user data
}
```
- Client ID: `EXPO_PUBLIC_GOOGLE_CLIENT_ID` (iOS + Android separate)
- app.json: add Google OAuth scheme configuration
- Handle cancellation gracefully

**2.1.2 — GoogleSignInButton component**
- Branded Google button (white background, Google logo, text)
- Loading state during OAuth flow
- i18n: `t('google_auth.sign_in_with_google')`
- Error handling with toast

**2.1.3 — Login/Register ეკრანებში ინტეგრაცია**
- "ან" divider between email form and Google button
- login.tsx: add GoogleSignInButton below form
- register.tsx: same layout

**2.1.4 — app.json configuration**
```json
{
  "expo": {
    "scheme": "booktranslator",
    "plugins": [
      ["expo-auth-session"],
      ["expo-web-browser"]
    ],
    "ios": {
      "infoPlist": {
        "CFBundleURLTypes": [{
          "CFBundleURLSchemes": ["com.googleusercontent.apps.YOUR_CLIENT_ID"]
        }]
      }
    }
  }
}
```

#### ტესტები (2.1):
```
tests/auth/
├── google-auth-service.test.ts
│   ├── sends idToken to /api/auth/google
│   ├── saves tokens on success
│   ├── handles Google cancellation
│   ├── handles backend error (invalid token)
│   └── handles network error
└── google-sign-in-button.test.ts
    ├── renders Google button with correct text
    ├── shows loading state during auth
    ├── calls signInWithGoogle on press
    ├── displays error toast on failure
    └── navigates to library on success
```

---

### 2.2 — Email Verification

**მიზანი:** რეგისტრაციის შემდეგ email დადასტურება + deep link handling

#### ფაილები შესაქმნელი:
```
apps/mobile/
├── app/
│   └── (auth)/
│       └── verify-email.tsx      # Email verification screen
└── src/
    └── services/
        └── deep-link.ts          # Deep link handler
```

#### დეტალური ამოცანები:

**2.2.1 — verify-email ეკრანი**
- Deep link: `booktranslator://verify-email?token=XXX`
- Auto-verify: `GET /api/auth/verify-email?token=XXX`
- States: verifying → success → redirect | error
- UI: Loading spinner → Success animation → "Login" button
- Resend verification: `POST /api/auth/resend-verification { email }`

**2.2.2 — Register flow update**
- register.tsx: after successful registration show "check your email" message
- Add resend button with 60-second cooldown timer
- Don't auto-login after register (wait for verification)

**2.2.3 — Login flow update**
- Handle 403 EMAIL_NOT_VERIFIED response
- Show "email not verified" message + resend button
- Store email temporarily for resend functionality

**2.2.4 — Deep link configuration**
- app.json: scheme "booktranslator" (already exists)
- Expo Router linking: handle `verify-email` route with token param
- Universal links setup for production (apple-app-site-association, assetlinks.json)

#### ტესტები (2.2):
```
tests/auth/
├── verify-email.test.ts
│   ├── extracts token from deep link
│   ├── calls verify-email API with token
│   ├── shows success state on 200
│   ├── shows error on invalid token
│   ├── shows error on expired token
│   └── navigates to login after success
├── register-flow.test.ts
│   ├── shows verification message after register
│   ├── resend button appears
│   ├── resend has 60s cooldown
│   └── cooldown timer decrements correctly
└── login-403.test.ts
    ├── detects EMAIL_NOT_VERIFIED error
    ├── shows resend verification UI
    └── resend calls correct API
```

---

### 2.3 — Change Password (In-App)

**მიზანი:** Profile-დან პაროლის შეცვლა email confirmation-ით

#### ფაილები შესაქმნელი:
```
apps/mobile/
├── app/
│   └── (tabs)/
│       └── change-password.tsx       # Change password screen
└── app/
    └── (auth)/
        └── confirm-password-change.tsx  # Deep link confirmation
```

#### დეტალური ამოცანები:

**2.3.1 — Change Password ეკრანი**
- Navigate from profile.tsx "პაროლის შეცვლა" button
- Form: new password + confirm password
- Validation: min 8 chars, 1 uppercase, 1 digit, passwords match
- API: `POST /api/auth/change-password { newPassword }` (JWT required)
- Success: show "check email for confirmation" message

**2.3.2 — Confirm Password Change**
- Deep link: `booktranslator://confirm-password-change?token=XXX`
- API: `POST /api/auth/confirm-password-change { token }`
- Success → redirect to profile with toast
- Error → show error + "try again" button

**2.3.3 — Profile ეკრანის განახლება**
- Add "პაროლის შეცვლა" section/button
- Navigate to change-password screen

#### ტესტები (2.3):
```
tests/auth/
├── change-password.test.ts
│   ├── validates password minimum length
│   ├── validates uppercase requirement
│   ├── validates digit requirement
│   ├── validates passwords match
│   ├── calls change-password API
│   ├── shows confirmation message on success
│   └── shows error toast on failure
└── confirm-password-change.test.ts
    ├── extracts token from deep link
    ├── calls confirm API
    ├── shows success + redirects to profile
    └── shows error on invalid token
```

---

## ფაზა 3 — ახალი ეკრანები

### 3.1 — Dashboard

**მიზანი:** User dashboard — სტატისტიკა, ბოლო აქტივობა, სწრაფი ქმედებები

#### ფაილები შესაქმნელი:
```
apps/mobile/
├── app/
│   └── (tabs)/
│       └── dashboard.tsx         # Dashboard tab screen
└── src/
    └── hooks/
        └── useDashboardData.ts   # Dashboard data fetching hook
```

#### დეტალური ამოცანები:

**3.1.1 — useDashboardData hook**
```typescript
interface DashboardStats {
  totalBooks: number;
  inProgress: number;
  completed: number;
}

interface DashboardData {
  translations: Translation[];
  stats: DashboardStats;
  recentActivity: Translation[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}
```
- API: `GET /api/translations/my`
- Stats: computed from translations array
- Recent activity: last 5 translations sorted by date
- Retry logic: 3 attempts with exponential backoff

**3.1.2 — Dashboard UI**
- Greeting: "გამარჯობა, {name}!" + formatted date
- Stats cards row (3 cards): total, in-progress, completed
- Recent activity FlatList:
  - Book cover (Image or placeholder with first letter)
  - Title + status badge
  - Progress bar (for in-progress)
  - "წაკითხვა" button (for completed)
- Quick actions: "ძებნა" + "ატვირთვა" buttons
- Pull-to-refresh
- Empty state: "No activity yet" + search button
- Error state with retry button

**3.1.3 — Tab navigation განახლება**
- (tabs)/_layout.tsx: add Dashboard tab
- Tab order: Dashboard, Library, Search, Profile
- Icon: home/dashboard icon
- Tab label: `t('navbar.dashboard')`

#### ტესტები (3.1):
```
tests/dashboard/
├── use-dashboard-data.test.ts
│   ├── fetches translations from API
│   ├── computes stats correctly
│   ├── returns last 5 as recent activity
│   ├── handles empty translations array
│   ├── retries on failure (3x)
│   ├── handles network error
│   └── retry function refetches data
└── dashboard-screen.test.ts
    ├── displays user greeting with name
    ├── shows stats cards with correct numbers
    ├── renders recent activity list
    ├── shows progress bar for in-progress items
    ├── "continue reading" navigates to reader
    ├── pull-to-refresh triggers reload
    ├── empty state shown when no translations
    └── error state shows retry button
```

---

### 3.2 — Settings

**მიზანი:** Notification preferences + Reader defaults + Language switch

#### ფაილები შესაქმნელი:
```
apps/mobile/app/settings.tsx      # Settings screen (stack, not tab)
```

#### დეტალური ამოცანები:

**3.2.1 — Notification Settings Section**
- API: `GET/PATCH /api/notifications/preferences`
- Toggle switches:
  - Email notifications (emailEnabled)
  - Push notifications (pushEnabled) — expo-notifications permission
  - In-app notifications (inAppEnabled)
- Event toggles:
  - Translation completed (translationCompleted)
  - TTS completed (ttsCompleted)
  - Payment receipt (paymentReceipt)
- Auto-save on toggle change (PATCH immediately)
- "Saved" indicator (2s visibility)

**3.2.2 — Reader Defaults Section**
- Stored in AsyncStorage (key: `reader-settings`)
- Font family picker: default, serif, sans-serif, bpg
- Font size slider: 14-28px
- Line height slider: 1.4-2.2
- Theme selector: light, sepia, dark (3 buttons)
- Preview text in current settings

**3.2.3 — Language Section**
- Current locale display
- Ka/En toggle buttons
- Changes locale via LocaleContext.setLocale()
- Shows confirmation: "ენა შეიცვალა"

**3.2.4 — Profile-დან navigation**
- profile.tsx: add "პარამეტრები" button → router.push('/settings')

#### ტესტები (3.2):
```
tests/settings/
├── notification-prefs.test.ts
│   ├── fetches preferences on mount
│   ├── toggles update API immediately
│   ├── shows "saved" indicator
│   ├── handles API error gracefully
│   └── push toggle checks device permission
├── reader-defaults.test.ts
│   ├── loads saved settings from AsyncStorage
│   ├── font size slider updates correctly
│   ├── line height slider works
│   ├── theme buttons switch theme
│   ├── saves to AsyncStorage on change
│   └── preview text reflects current settings
└── language-section.test.ts
    ├── shows current locale
    ├── switches locale on button press
    └── persists locale change
```

---

### 3.3 — Upload

**მიზანი:** ფაილის ატვირთვა მობილურიდან (DocumentPicker + upload progress)

#### ფაილები შესაქმნელი:
```
apps/mobile/
├── app/upload.tsx                # Upload screen (stack)
└── src/services/
    └── upload.ts                 # File upload service
```

#### დამოკიდებულებები:
```bash
npx expo install expo-document-picker
```

#### დეტალური ამოცანები:

**3.3.1 — Upload Service**
```typescript
// src/services/upload.ts
export async function uploadBook(
  fileUri: string,
  fileName: string,
  mimeType: string,
  onProgress?: (percent: number) => void,
): Promise<UploadResponse> {
  // FormData with file
  // XMLHttpRequest for progress tracking
  // POST /api/books/upload
}

interface UploadResponse {
  duplicate: boolean;
  book: { id: string; title?: string };
  translationAvailable?: boolean;
  message: string;
}
```

**3.3.2 — Upload Screen UI**
- Document picker button (expo-document-picker)
  - Accepted types: PDF, EPUB, TXT, DOCX
  - Max size: 50MB
- Selected file info display (name, size, format icon)
- Upload button with progress bar (0-100%)
- States: idle → selected → uploading → success/error
- Success: show book info + "View Book" button → navigate to `/book/{id}`
- Duplicate: show message + "View Book" button
- Error states: type error, size error, network error

**3.3.3 — Validation**
- File extension check against ALLOWED_FORMATS
- File size check against MAX_SIZE (50MB)
- Show specific error messages per validation failure

**3.3.4 — Navigation**
- Dashboard quick action → upload screen
- Search screen: add upload FAB/button
- Tab navigation: add upload option (or top-right button)

#### ტესტები (3.3):
```
tests/upload/
├── upload-service.test.ts
│   ├── creates correct FormData
│   ├── sends auth header
│   ├── reports progress correctly
│   ├── handles success response
│   ├── handles duplicate response
│   ├── handles network error
│   └── handles timeout
├── upload-screen.test.ts
│   ├── opens document picker on button press
│   ├── validates file type
│   ├── validates file size
│   ├── shows selected file info
│   ├── shows upload progress bar
│   ├── navigates to book on success
│   ├── shows duplicate message
│   └── shows error state with retry
└── file-validation.test.ts
    ├── accepts PDF, EPUB, TXT, DOCX
    ├── rejects unsupported formats
    ├── rejects files over 50MB
    └── handles files without extension
```

---

### 3.4 — Favorites

**მიზანი:** ფავორიტი წიგნების სია

#### ფაილები შესაქმნელი:
```
apps/mobile/app/favorites.tsx     # Favorites screen (stack)
```

#### დეტალური ამოცანები:

**3.4.1 — Favorites Screen**
- API: `GET /api/favorites` (if endpoint exists) or local AsyncStorage
- FlatList of favorite books
- Book card: cover, title, author
- Tap → navigate to `/book/{id}`
- Remove from favorites (swipe-to-delete or long-press)
- Pull-to-refresh
- Empty state: star icon + "Browse books" button → search

**3.4.2 — Favorite toggle on Book Detail**
- book/[id].tsx: add heart/star icon button
- Toggle: `POST/DELETE /api/favorites/{bookId}`
- Optimistic UI update

**3.4.3 — Profile-დან navigation**
- profile.tsx: "ფავორიტები" button → router.push('/favorites')

#### ტესტები (3.4):
```
tests/favorites/
├── favorites-screen.test.ts
│   ├── fetches favorites on mount
│   ├── renders book cards
│   ├── navigates to book detail on tap
│   ├── removes favorite on action
│   ├── pull-to-refresh works
│   └── empty state shown when no favorites
└── favorite-toggle.test.ts
    ├── adds to favorites on press
    ├── removes from favorites on second press
    ├── optimistic UI update
    └── reverts on API error
```

---

### 3.5 — Translation History

**მიზანი:** მომხმარებლის თარგმანების ისტორია

#### ფაილები შესაქმნელი:
```
apps/mobile/app/translations.tsx  # Translation history screen
```

#### დეტალური ამოცანები:

**3.5.1 — Translations Screen**
- Data: reuse useDashboardData hook
- FlatList with translation items:
  - Book cover (or placeholder)
  - Title + author
  - Status badge (COMPLETED=green, IN_PROGRESS=blue, FAILED=red, PAID=orange, PENDING=gray)
  - Created date (formatted)
  - Progress bar (IN_PROGRESS/PAID only)
  - "წაკითხვა" button (COMPLETED only)
- Pull-to-refresh
- Empty state: book icon + "Start translating" → search

**3.5.2 — Profile-დან navigation**
- profile.tsx: "ჩემი თარგმანები" button → router.push('/translations')

#### ტესტები (3.5):
```
tests/translations/
└── translations-screen.test.ts
    ├── fetches and displays translations
    ├── shows correct status badges
    ├── shows progress bar for in-progress
    ├── "read" button only for completed
    ├── navigates to reader on "read" press
    ├── pull-to-refresh works
    └── empty state shown when no translations
```

---

### 3.6 — Payment History

**მიზანი:** გადახდების ისტორია

#### ფაილები შესაქმნელი:
```
apps/mobile/app/payments.tsx      # Payment history screen
```

#### დეტალური ამოცანები:

**3.6.1 — Payments Screen**
- API: `GET /api/payments/history?page={page}&limit=10`
- FlatList with payment items:
  - Provider badge (BOG/TBC)
  - Description
  - Amount: "X.XX ₾" or "X.XX USD"
  - Date + time (formatted with locale)
  - Status badge (COMPLETED=green, PROCESSING=yellow, FAILED=red, REFUNDED=gray)
- Pagination: "Load more" button or infinite scroll
- Pull-to-refresh
- Empty state: "No payments" + "Start translating" link

**3.6.2 — Profile-დან navigation**
- profile.tsx: "გადახდების ისტორია" button → router.push('/payments')

#### ტესტები (3.6):
```
tests/payments/
└── payments-screen.test.ts
    ├── fetches payment history
    ├── displays amount with correct currency symbol
    ├── shows provider badge
    ├── shows correct status colors
    ├── pagination loads more items
    ├── pull-to-refresh works
    └── empty state shown when no payments
```

---

## ფაზა 4 — Payments

### 4.1 — Payment Modal / WebView Flow

**მიზანი:** BOG/TBC გადახდა WebView redirect-ით

#### ფაილები შესაქმნელი:
```
apps/mobile/
├── src/
│   ├── components/
│   │   └── common/
│   │       └── PaymentModal.tsx   # Payment provider selection
│   └── services/
│       └── payment.ts            # Payment service
├── app/
│   ├── payment-success.tsx       # Payment success screen
│   └── payment-failure.tsx       # Payment failure screen
```

#### დამოკიდებულებები:
```bash
npx expo install react-native-webview
```

#### დეტალური ამოცანები:

**4.1.1 — Payment Service**
```typescript
// src/services/payment.ts
export async function createPayment(params: {
  bookId: string;
  type: 'TRANSLATION' | 'PURCHASE_ORIGINAL' | 'PURCHASE_TRANSLATION';
  provider: 'BOG' | 'TBC';
  translationId?: string;
}): Promise<{ paymentUrl: string; paymentId: string }> {
  return apiRequest('/payments', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function getBookPricing(bookId: string): Promise<{
  newTranslation: number;
  existing: number;
  english: number;
}> {
  return apiRequest(`/payments/pricing/${bookId}`);
}
```

**4.1.2 — PaymentModal component**
- Modal presentation (react-native Modal)
- Shows amount + currency
- Provider selection: BOG / TBC radio buttons
- "გადახდა" button
- Loading state during payment creation
- On success: open WebView with paymentUrl
- WebView detects callback URL → navigate to success/failure

**4.1.3 — WebView Payment Flow**
- Open bank payment URL in WebView (or expo-web-browser)
- Listen for redirect back to app scheme: `booktranslator://payment/success` or `booktranslator://payment/failure`
- Parse payment result from URL params

**4.1.4 — Success/Failure Screens**
- payment-success.tsx:
  - Success icon + message
  - "Back to Books" button → library
- payment-failure.tsx:
  - Error icon + message
  - "Try Again" button → back to book

**4.1.5 — Book Detail ინტეგრაცია**
- book/[id].tsx: "თარგმნა" button opens PaymentModal
- Pass bookId, translation type, price info

#### ტესტები (4.1):
```
tests/payment/
├── payment-service.test.ts
│   ├── creates payment with correct params
│   ├── returns paymentUrl
│   ├── handles API error
│   └── fetches pricing correctly
├── payment-modal.test.ts
│   ├── shows amount and currency
│   ├── provider selection works
│   ├── pay button calls createPayment
│   ├── loading state during payment
│   ├── opens WebView/browser on success
│   └── shows error toast on failure
└── payment-screens.test.ts
    ├── success screen renders correctly
    ├── success navigates to library
    ├── failure screen renders correctly
    └── failure "try again" navigates back
```

---

## ფაზა 5 — Notifications

### 5.1 — Push Notifications (expo-notifications)

**მიზანი:** Push notifications მოწყობილობაზე

#### ფაილები შესაქმნელი:
```
apps/mobile/src/
├── services/
│   └── push-notifications.ts     # Push notification service
└── hooks/
    └── usePushNotifications.ts   # Push notification hook
```

#### დამოკიდებულებები:
```bash
npx expo install expo-notifications expo-device expo-constants
```

#### დეტალური ამოცანები:

**5.1.1 — Push Notification Service**
```typescript
// src/services/push-notifications.ts
export async function registerForPushNotifications(): Promise<string | null> {
  // 1. Check device (not simulator)
  // 2. Request permission
  // 3. Get Expo push token
  // 4. POST /api/notifications/push/subscribe { endpoint, token, platform }
  // 5. Return token
}

export async function unregisterPushNotifications(): Promise<void> {
  // DELETE /api/notifications/push/unsubscribe
}
```

**5.1.2 — Notification Handlers**
- Foreground: show in-app toast
- Background: system notification
- Tap handler: navigate to relevant screen
  - Translation completed → `/book/{id}`
  - Payment receipt → `/payments`
  - TTS completed → `/reader/{id}`

**5.1.3 — app.json notification configuration**
```json
{
  "expo": {
    "plugins": [
      ["expo-notifications", {
        "icon": "./assets/notification-icon.png",
        "color": "#2563eb"
      }]
    ],
    "android": {
      "useNextNotificationsApi": true
    }
  }
}
```

**5.1.4 — _layout.tsx ინტეგრაცია**
- Register for push on app launch (if user authenticated)
- Set up notification listeners
- Handle notification response (tap → navigate)

#### ტესტები (5.1):
```
tests/notifications/
├── push-service.test.ts
│   ├── requests device permission
│   ├── gets Expo push token
│   ├── subscribes to backend
│   ├── handles permission denied
│   ├── handles simulator (no push)
│   └── unsubscribes correctly
└── notification-handlers.test.ts
    ├── foreground notification shows toast
    ├── tap navigates to correct screen
    ├── translation notification → book detail
    ├── payment notification → payments
    └── handles unknown notification type
```

---

### 5.2 — WebSocket Real-Time Notifications

**მიზანი:** Socket.io integration — real-time notification updates

#### ფაილები შესაქმნელი:
```
apps/mobile/src/
├── services/
│   └── socket.ts                 # Socket.io client
└── hooks/
    └── useNotifications.ts       # Notifications hook (REST + WebSocket)
```

#### დამოკიდებულებები:
```bash
cd apps/mobile && pnpm add socket.io-client
```

#### დეტალური ამოცანები:

**5.2.1 — Socket Service**
```typescript
// src/services/socket.ts
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function connectSocket(token: string): Socket {
  socket = io(`${API_URL}/notifications`, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
```

**5.2.2 — useNotifications hook**
```typescript
interface UseNotificationsReturn {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  fetchNotifications: (page?: number) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}
```
- REST: `GET /api/notifications`, `PATCH .../read`, `PATCH .../read-all`
- WebSocket events: `notification:new`, `notification:unread-count`
- Merge real-time + REST data
- Connect socket on mount, disconnect on unmount

**5.2.3 — Notification Center Screen**
```
apps/mobile/app/notifications.tsx
```
- FlatList of notifications
- Relative timestamps (ახლახანს, X წუთის წინ, X საათის წინ, X დღის წინ)
- Mark as read on tap (visual + API)
- "Mark all as read" header button
- Empty state
- Pull-to-refresh
- Navigate from profile or header bell icon

**5.2.4 — Notification Bell (Badge)**
- Profile tab or header: notification bell icon with unread count badge
- Tap → navigate to notifications screen
- Real-time badge update via WebSocket

#### ტესტები (5.2):
```
tests/notifications/
├── socket-service.test.ts
│   ├── connects with auth token
│   ├── reconnects on disconnect
│   ├── disconnects cleanly
│   └── uses websocket transport
├── use-notifications.test.ts
│   ├── fetches notifications on mount
│   ├── fetches unread count
│   ├── marks single as read
│   ├── marks all as read
│   ├── handles new notification event
│   ├── updates unread count from event
│   └── merges real-time with existing
└── notification-center.test.ts
    ├── renders notification list
    ├── shows relative timestamps
    ├── mark as read changes visual
    ├── mark all as read button works
    ├── empty state when no notifications
    ├── pull-to-refresh works
    └── navigates from bell icon
```

---

## ფაზა 6 — Reader გაუმჯობესება

### 6.1 — Highlights

**მიზანი:** ტექსტის selection + highlight + color picker

#### ფაილები შესაცვლელი/შესაქმნელი:
```
apps/mobile/
├── app/reader/[id].tsx           # ← გაუმჯობესება
└── src/
    └── components/
        └── reader/
            ├── HighlightOverlay.tsx   # Highlight rendering
            └── ColorPicker.tsx        # Highlight color selection
```

#### დეტალური ამოცანები:

**6.1.1 — Text Selection Handler**
- Detect text selection in reader ScrollView
- Show action popup: "Highlight" | "Note" | "Copy"
- Get selection range (startPosition, endPosition, selectedText)

**6.1.2 — Highlight CRUD**
- Use `@book-translator/reader` package: `useHighlights(bookId, token)`
- Or direct API calls:
  - `POST /api/reader/highlights { bookId, chapterNumber, startPosition, endPosition, selectedText, color }`
  - `GET /api/reader/highlights/{bookId}`
  - `PATCH /api/reader/highlights/{id} { color }`
  - `DELETE /api/reader/highlights/{id}`

**6.1.3 — ColorPicker component**
- 4 colors: yellow, green, blue, red
- Small popup near selected text
- Tap color → create/update highlight

**6.1.4 — HighlightOverlay**
- Render colored backgrounds over highlighted text
- Tap highlight → show options (change color, delete, add note)
- Highlights panel in modal (like bookmarks panel)

**6.1.5 — Highlights List Modal**
- Button in reader toolbar
- FlatList of all highlights
- Show: selected text preview + color indicator + chapter number
- Tap → navigate to highlight position
- Swipe to delete

#### ტესტები (6.1):
```
tests/reader/
├── highlights-crud.test.ts
│   ├── creates highlight via API
│   ├── fetches highlights for book
│   ├── updates highlight color
│   ├── deletes highlight
│   └── handles API errors
├── color-picker.test.ts
│   ├── renders 4 color options
│   ├── selected color highlighted
│   └── tap triggers color change
└── highlights-list.test.ts
    ├── displays all highlights
    ├── shows text preview
    ├── tap navigates to position
    └── delete removes from list
```

---

### 6.2 — Reader Settings Sync

**მიზანი:** Reader settings AsyncStorage + Settings page sync

#### დეტალური ამოცანები:

**6.2.1 — Reader settings from Settings page**
- reader/[id].tsx: read settings from AsyncStorage (key: `reader-settings`)
- Apply: fontSize, fontFamily, lineHeight, theme
- Settings page changes → reader reflects immediately

**6.2.2 — In-reader settings panel**
- Floating settings button in reader
- Bottom sheet with:
  - Font size: A- / A+ buttons
  - Font family: 4 options
  - Line height: slider
  - Theme: light/sepia/dark
- Changes apply immediately + save to AsyncStorage

**6.2.3 — Reader theme mapping**
```typescript
const readerThemes = {
  light: { background: '#ffffff', text: '#1a1a1a' },
  sepia: { background: '#f4ecd8', text: '#5c4b37' },
  dark: { background: '#1a1a1a', text: '#e0e0e0' },
};
```

#### ტესტები (6.2):
```
tests/reader/
├── reader-settings.test.ts
│   ├── loads settings from AsyncStorage
│   ├── applies font size to text
│   ├── applies font family
│   ├── applies line height
│   ├── applies theme colors
│   └── saves changes to AsyncStorage
└── settings-panel.test.ts
    ├── opens settings panel
    ├── font size buttons work
    ├── font family selection works
    ├── line height slider works
    ├── theme buttons switch theme
    └── changes reflect immediately
```

---

### 6.3 — Offline Reading

**მიზანი:** წიგნის ოფლაინ კითხვა (cache translated content)

#### ფაილები შესაქმნელი:
```
apps/mobile/src/services/
└── book-cache.ts                 # Offline book content cache
```

#### დეტალური ამოცანები:

**6.3.1 — Book Cache Service**
```typescript
class BookCacheService {
  async cacheTranslation(translationId: string, chapters: TranslatedChapter[]): Promise<void>;
  async getCachedTranslation(translationId: string): Promise<TranslatedChapter[] | null>;
  async isCached(translationId: string): Promise<boolean>;
  async removeCached(translationId: string): Promise<void>;
  async getCacheSize(): Promise<number>;
  async clearAll(): Promise<void>;
}
```
- Storage: expo-file-system (JSON files per translation)
- Max cache: 200MB
- LRU eviction (same pattern as audio-cache.ts)

**6.3.2 — Reader offline support**
- reader/[id].tsx: try API first, fallback to cache
- "Download for offline" button on book detail
- Download progress indicator
- Offline indicator in reader header

**6.3.3 — Library offline indicators**
- library.tsx: show downloaded icon on cached books
- Settings: "Manage offline content" section with total cache size

#### ტესტები (6.3):
```
tests/offline/
├── book-cache.test.ts
│   ├── caches translation chapters
│   ├── retrieves cached content
│   ├── isCached returns correct state
│   ├── removes specific cached book
│   ├── enforces 200MB size limit
│   ├── LRU eviction works
│   └── clearAll removes everything
└── reader-offline.test.ts
    ├── loads from API when online
    ├── falls back to cache when offline
    ├── shows offline indicator
    ├── download button caches content
    └── download progress works
```

---

## ფაზა 7 — Polish & Production

### 7.1 — Sentry Integration

**მიზანი:** Error tracking და performance monitoring

#### დამოკიდებულებები:
```bash
npx expo install @sentry/react-native
```

#### დეტალური ამოცანები:

**7.1.1 — Sentry Setup**
- app/_layout.tsx: `Sentry.init({ dsn: EXPO_PUBLIC_SENTRY_DSN })`
- Wrap root component with `Sentry.wrap()`
- Configure: tracesSampleRate, replaysSessionSampleRate
- Add Sentry plugin to app.json

**7.1.2 — Error Boundaries**
- Global error boundary component
- Screen-level error boundaries for critical screens (reader, payment)
- Sentry.captureException() in catch blocks

**7.1.3 — Performance Monitoring**
- Navigation tracking
- API call performance
- Reader rendering performance

#### ტესტები (7.1):
```
tests/monitoring/
└── sentry.test.ts
    ├── initializes with correct DSN
    ├── captures exceptions
    ├── wraps navigation correctly
    └── error boundary catches errors
```

---

### 7.2 — Deep Linking (Full)

**მიზანი:** Universal links + app scheme handling

#### დეტალური ამოცანები:

**7.2.1 — URL Scheme Handling**
- `booktranslator://` scheme routes:
  - `verify-email?token=X` → verify email screen
  - `reset-password?token=X` → reset password screen
  - `confirm-password-change?token=X` → confirm screen
  - `payment/success` → success screen
  - `payment/failure` → failure screen
  - `book/{id}` → book detail
  - `reader/{id}` → reader

**7.2.2 — Universal Links (Production)**
- iOS: apple-app-site-association file
- Android: assetlinks.json + intent filters
- Backend: serve /.well-known/ files

**7.2.3 — Expo Router linking configuration**
```typescript
// app/_layout.tsx
export const unstable_settings = {
  initialRouteName: 'index',
};
```

#### ტესტები (7.2):
```
tests/deep-linking/
└── deep-link-handler.test.ts
    ├── handles verify-email deep link
    ├── handles reset-password deep link
    ├── handles payment callbacks
    ├── handles book detail link
    ├── handles unknown link gracefully
    └── extracts query params correctly
```

---

### 7.3 — App Store Preparation

**მიზანი:** iOS/Android store-ისთვის მომზადება

#### დეტალური ამოცანები:

**7.3.1 — App Icons & Splash Screen**
- App icon: 1024x1024 (source) → all sizes generated by Expo
- Adaptive icon (Android): foreground + background
- Splash screen: logo + branded background (#2563eb)

**7.3.2 — EAS Build Configuration**
```json
// eas.json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {}
  }
}
```

**7.3.3 — App Store Metadata**
- Description (ka + en)
- Screenshots (6.7" iPhone, 12.9" iPad, phone Android)
- Privacy policy URL
- Keywords

**7.3.4 — Performance Optimization**
- Image optimization (expo-image instead of RN Image)
- FlatList optimization (getItemLayout, windowSize)
- Lazy loading screens
- Bundle size analysis

**7.3.5 — Final QA Checklist**
- [ ] ყველა ეკრანი მუშაობს iOS-ზე
- [ ] ყველა ეკრანი მუშაობს Android-ზე
- [ ] Dark mode ყველა ეკრანზე
- [ ] i18n: ka + en ყველა string
- [ ] Offline mode: cached books readable
- [ ] Push notifications: receive + tap navigate
- [ ] Deep links: all routes handled
- [ ] Payment flow: complete cycle
- [ ] Auth: login, register, OAuth, password reset
- [ ] Reader: read, bookmark, highlight, note, progress
- [ ] Audio: play, cache, background playback
- [ ] Upload: file pick + upload + progress
- [ ] Error states: all screens handle errors
- [ ] Empty states: all lists have empty state
- [ ] Pull-to-refresh: all data lists
- [ ] Keyboard avoidance: all forms
- [ ] Safe area: all screens
- [ ] Accessibility: labels on interactive elements

#### ტესტები (7.3):
```
tests/e2e/
├── auth-flow.e2e.ts
│   ├── register → verify → login
│   ├── Google OAuth login
│   ├── forgot → reset password
│   └── change password flow
├── book-flow.e2e.ts
│   ├── search → book detail → translate → pay → read
│   ├── upload → book detail
│   └── library shows translated books
├── reader-flow.e2e.ts
│   ├── open reader → read → bookmark → note
│   ├── highlight text → change color
│   ├── reader settings change
│   └── reading progress saved
└── notification-flow.e2e.ts
    ├── receive push notification
    ├── tap → navigate to correct screen
    └── notification center → mark read
```

---

## ფაილ-ცვლილებების სრული რუკა

### ახალი ფაილები (ჯამი: ~45)

```
apps/mobile/
├── app/
│   ├── (auth)/
│   │   ├── verify-email.tsx              # ფაზა 2.2
│   │   └── confirm-password-change.tsx   # ფაზა 2.3
│   ├── (tabs)/
│   │   ├── dashboard.tsx                 # ფაზა 3.1
│   │   └── change-password.tsx           # ფაზა 2.3
│   ├── settings.tsx                      # ფაზა 3.2
│   ├── upload.tsx                        # ფაზა 3.3
│   ├── favorites.tsx                     # ფაზა 3.4
│   ├── translations.tsx                  # ფაზა 3.5
│   ├── payments.tsx                      # ფაზა 3.6
│   ├── notifications.tsx                 # ფაზა 5.2
│   ├── payment-success.tsx               # ფაზა 4.1
│   └── payment-failure.tsx               # ფაზა 4.1
├── src/
│   ├── i18n/
│   │   ├── index.ts                      # ფაზა 1.1
│   │   ├── useTranslation.ts             # ფაზა 1.1
│   │   └── locales/
│   │       ├── ka.json                   # ფაზა 1.1
│   │       └── en.json                   # ფაზა 1.1
│   ├── context/
│   │   ├── LocaleContext.tsx             # ფაზა 1.1
│   │   └── ToastContext.tsx              # ფაზა 1.2
│   ├── components/
│   │   ├── common/
│   │   │   ├── Toast.tsx                 # ფაზა 1.2
│   │   │   ├── GoogleSignInButton.tsx    # ფაზა 2.1
│   │   │   └── PaymentModal.tsx          # ფაზა 4.1
│   │   └── reader/
│   │       ├── HighlightOverlay.tsx      # ფაზა 6.1
│   │       └── ColorPicker.tsx           # ფაზა 6.1
│   ├── services/
│   │   ├── google-auth.ts               # ფაზა 2.1
│   │   ├── deep-link.ts                 # ფაზა 2.2
│   │   ├── upload.ts                    # ფაზა 3.3
│   │   ├── payment.ts                   # ფაზა 4.1
│   │   ├── push-notifications.ts        # ფაზა 5.1
│   │   ├── socket.ts                    # ფაზა 5.2
│   │   ├── book-cache.ts               # ფაზა 6.3
│   │   └── network.ts                  # ფაზა 1.3
│   └── hooks/
│       ├── useDashboardData.ts          # ფაზა 3.1
│       ├── useNotifications.ts          # ფაზა 5.2
│       ├── usePushNotifications.ts      # ფაზა 5.1
│       └── useNetworkStatus.ts          # ფაზა 1.3
```

### არსებული ფაილები შესაცვლელი:
```
app/_layout.tsx                   # ფაზა 1.1, 1.2, 5.1, 7.1
app/(auth)/login.tsx              # ფაზა 1.1, 1.2, 2.1, 2.2
app/(auth)/register.tsx           # ფაზა 1.1, 1.2, 2.1, 2.2
app/(auth)/forgot-password.tsx    # ფაზა 1.1
app/(auth)/reset-password.tsx     # ფაზა 1.1
app/(tabs)/_layout.tsx            # ფაზა 1.1, 3.1
app/(tabs)/library.tsx            # ფაზა 1.1, 6.3
app/(tabs)/search.tsx             # ფაზა 1.1
app/(tabs)/profile.tsx            # ფაზა 1.1, 2.3, 3.2, 3.4, 3.5, 3.6
app/book/[id].tsx                 # ფაზა 1.1, 3.4, 4.1
app/reader/[id].tsx               # ფაზა 1.1, 6.1, 6.2, 6.3
src/services/api.ts               # ფაზა 1.3
package.json                      # ყველა ფაზა (dependencies)
app.json                          # ფაზა 2.1, 5.1, 7.1, 7.3
tsconfig.json                     # (if needed)
```

---

## ტესტების სრული რუკა

| ფაზა | ტესტ ფაილები | სავარაუდო ტესტების რაოდენობა |
|------|-------------|---------------------------|
| 1.1 i18n | 3 ფაილი | ~15 ტესტი |
| 1.2 Toast | 2 ფაილი | ~10 ტესტი |
| 1.3 API | 2 ფაილი | ~10 ტესტი |
| 2.1 Google OAuth | 2 ფაილი | ~10 ტესტი |
| 2.2 Email Verification | 3 ფაილი | ~12 ტესტი |
| 2.3 Change Password | 2 ფაილი | ~8 ტესტი |
| 3.1 Dashboard | 2 ფაილი | ~15 ტესტი |
| 3.2 Settings | 3 ფაილი | ~12 ტესტი |
| 3.3 Upload | 3 ფაილი | ~15 ტესტი |
| 3.4 Favorites | 2 ფაილი | ~8 ტესტი |
| 3.5 Translations | 1 ფაილი | ~7 ტესტი |
| 3.6 Payments | 1 ფაილი | ~7 ტესტი |
| 4.1 Payment Flow | 3 ფაილი | ~15 ტესტი |
| 5.1 Push | 2 ფაილი | ~10 ტესტი |
| 5.2 WebSocket | 3 ფაილი | ~15 ტესტი |
| 6.1 Highlights | 3 ფაილი | ~12 ტესტი |
| 6.2 Reader Settings | 2 ფაილი | ~10 ტესტი |
| 6.3 Offline | 2 ფაილი | ~10 ტესტი |
| 7.1 Sentry | 1 ფაილი | ~4 ტესტი |
| 7.2 Deep Links | 1 ფაილი | ~6 ტესტი |
| 7.3 E2E | 4 ფაილი | ~15 ტესტი |
| **ჯამი** | **~47 ფაილი** | **~226 ტესტი** |

---

## დამოკიდებულებების სრული სია

```bash
# ფაზა 1
npx expo install expo-localization i18n-js
npx expo install @react-native-community/netinfo

# ფაზა 2
npx expo install expo-auth-session expo-crypto expo-web-browser

# ფაზა 3
npx expo install expo-document-picker

# ფაზა 4
npx expo install react-native-webview

# ფაზა 5
npx expo install expo-notifications expo-device expo-constants
pnpm add socket.io-client

# ფაზა 7
npx expo install @sentry/react-native expo-image
```

---

## პრიორიტეტი და თანმიმდევრობა

```
ფაზა 1 (Foundation)     ──► ფაზა 2 (Auth)     ──► ფაზა 3 (Screens)
     │                        │                       │
     └── i18n                 ├── Google OAuth         ├── Dashboard
     └── Toast                ├── Email Verify         ├── Settings
     └── API improvements     └── Change Password      ├── Upload
                                                       ├── Favorites
                                                       ├── Translation History
                                                       └── Payment History
                                                              │
                              ফაზა 4 (Payments) ◄─────────────┘
                                   │
                              ფაზা 5 (Notifications)
                                   │
                              ফაზა 6 (Reader+)
                                   │
                              ფাზა 7 (Polish)
```

> **შენიშვნა:** ფაზა 1 არის prerequisite ყველა სხვა ფაზისთვის. ფაზები 3-6 ნაწილობრივ პარალელურად შეიძლება.
