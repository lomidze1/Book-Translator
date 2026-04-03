# ფაზა 5: Online Reader + React Native — სრული გეგმა

## არქიტექტურა

```
packages/reader/           ← საერთო ლოგიკა (ორივე პლატფორმა იყენებს)
├── src/
│   ├── hooks/             ← useReadingProgress, useBookmarks, useHighlights, useNotes
│   ├── api/               ← reader API client functions
│   ├── types/             ← TypeScript interfaces
│   ├── utils/             ← text processing, position calculation
│   └── index.ts

apps/web/                  ← Web Reader (Next.js + SCSS)
├── src/app/[locale]/books/[id]/read/
│   ├── page.tsx
│   ├── ReaderView.tsx
│   └── components/
│       ├── ReaderContent.tsx
│       ├── ReaderToolbar.tsx
│       ├── ReaderSidebar.tsx
│       ├── TextSelection.tsx
│       └── BookmarkButton.tsx

apps/mobile/               ← React Native (Expo)
├── src/
│   ├── screens/
│   │   ├── LoginScreen.tsx
│   │   ├── LibraryScreen.tsx
│   │   ├── ReaderScreen.tsx
│   │   └── AudioPlayerScreen.tsx
│   ├── components/
│   │   ├── ReaderContent.tsx
│   │   ├── ReaderToolbar.tsx
│   │   └── AudioPlayer.tsx
│   └── navigation/

apps/api/src/reader/       ← Reader API (NestJS)
├── reader.module.ts
├── reader.controller.ts
├── reader.service.ts
└── dto/
```

## რატომ ეს არქიტექტურა?

- `packages/reader/` — hooks + API + types **ერთხელ** იწერება
- Web და Mobile **მხოლოდ UI** ცალ-ცალკე (არ იწერება ლოგიკა ორჯერ)
- API ერთია — ორივე პლატფორმა იმავე backend-ს იყენებს
- **არაფრის გადაწერა არ მოუწევს** მომავალში

---

## ნაწილი 1: Backend — Reader API Module

### 1.1 Reader Controller + Service
**ფაილი:** `apps/api/src/reader/`

**Endpoints:**

```
# Reading Progress
POST   /api/reader/progress              — save position (chapter, position, percentage)
GET    /api/reader/progress/:bookId      — get last saved position

# Bookmarks
POST   /api/reader/bookmarks             — create bookmark
GET    /api/reader/bookmarks/:bookId     — list all bookmarks for book
DELETE /api/reader/bookmarks/:id         — delete bookmark

# Highlights
POST   /api/reader/highlights            — create highlight (with selected text, color, positions)
GET    /api/reader/highlights/:bookId    — list all highlights for book
PATCH  /api/reader/highlights/:id        — update color
DELETE /api/reader/highlights/:id        — delete highlight

# Notes
POST   /api/reader/notes                 — create note (optionally attached to highlight)
GET    /api/reader/notes/:bookId         — list all notes for book
PATCH  /api/reader/notes/:id             — update note content
DELETE /api/reader/notes/:id             — delete note
```

**ყველა endpoint მოითხოვს JWT auth.**

### 1.2 DTOs

```typescript
// save-progress.dto.ts
class SaveProgressDto {
  bookId: string;
  currentChapter: number;
  currentPosition: number;  // scroll position or character offset
  percentage: number;       // 0-100
}

// create-bookmark.dto.ts
class CreateBookmarkDto {
  bookId: string;
  chapterNumber: number;
  position: number;
  label?: string;           // optional user label
}

// create-highlight.dto.ts
class CreateHighlightDto {
  bookId: string;
  chapterNumber: number;
  startPosition: number;
  endPosition: number;
  selectedText: string;
  color?: string;           // yellow | green | blue | red (default: yellow)
}

// create-note.dto.ts
class CreateNoteDto {
  bookId: string;
  chapterNumber: number;
  highlightId?: string;     // optional — attach to highlight
  content: string;
}
```

### 1.3 DB მოდელები — უკვე არსებობს Prisma-ში ✅
- Bookmark, Highlight, Note, ReadingProgress — მზადაა
- AudioBook, AudioChapter — Phase 6-ისთვის მზადაა

---

## ნაწილი 2: Shared Package — `packages/reader/`

### 2.1 Types
```typescript
// packages/reader/src/types/index.ts
export interface ReaderSettings {
  fontSize: number;        // 14-28
  fontFamily: string;      // 'default' | 'serif' | 'sans-serif' | 'bpg'
  lineHeight: number;      // 1.4-2.2
  theme: 'light' | 'dark' | 'sepia';
  scrollMode: boolean;     // true=scroll, false=paginated
}

export interface ReadingPosition {
  bookId: string;
  currentChapter: number;
  currentPosition: number;
  percentage: number;
}

export interface Bookmark { id, bookId, chapterNumber, position, label, createdAt }
export interface Highlight { id, bookId, chapterNumber, startPosition, endPosition, color, selectedText }
export interface ReaderNote { id, bookId, chapterNumber, highlightId?, content }
```

### 2.2 API Client Functions
```typescript
// packages/reader/src/api/reader-api.ts
export const readerApi = {
  // Progress
  saveProgress(token, data: SaveProgressDto): Promise<ReadingPosition>
  getProgress(token, bookId): Promise<ReadingPosition | null>

  // Bookmarks
  createBookmark(token, data): Promise<Bookmark>
  getBookmarks(token, bookId): Promise<Bookmark[]>
  deleteBookmark(token, id): Promise<void>

  // Highlights
  createHighlight(token, data): Promise<Highlight>
  getHighlights(token, bookId): Promise<Highlight[]>
  deleteHighlight(token, id): Promise<void>

  // Notes
  createNote(token, data): Promise<ReaderNote>
  getNotes(token, bookId): Promise<ReaderNote[]>
  updateNote(token, id, content): Promise<ReaderNote>
  deleteNote(token, id): Promise<void>
}
```

### 2.3 Hooks (Platform-agnostic)
```typescript
// packages/reader/src/hooks/useReadingProgress.ts
export function useReadingProgress(bookId, token) {
  // Auto-save every 30 seconds
  // Resume from last position on load
  // Calculate percentage from scroll/page position
}

// packages/reader/src/hooks/useBookmarks.ts
export function useBookmarks(bookId, token) {
  // CRUD operations
  // Local cache + API sync
}

// packages/reader/src/hooks/useHighlights.ts
// packages/reader/src/hooks/useNotes.ts
// packages/reader/src/hooks/useReaderSettings.ts — localStorage/AsyncStorage
```

---

## ნაწილი 3: Web Reader (Next.js)

### 3.1 ReaderView — მთავარი კომპონენტი
**ფაილი:** `apps/web/src/app/[locale]/books/[id]/read/ReaderView.tsx`

```
┌─────────────────────────────────────────────────────┐
│  ReaderToolbar                                       │
│  [← Back] [TOC] [Aa] [🌙] [🔖] [⛶]               │
├──────────┬──────────────────────────────────────────┤
│          │                                          │
│  Sidebar │  ReaderContent                           │
│          │                                          │
│  TOC     │  თავი 1 — შესავალი                      │
│  --------│                                          │
│  თავი 1  │  ტექსტი ტექსტი ტექსტი ტექსტი          │
│  თავი 2  │  ტექსტი ტექსტი ტექსტი ტექსტი          │
│  თავი 3  │                                          │
│  --------│  [highlighted text in yellow]             │
│  Bookmarks│                                         │
│  p.15 🔖 │  ტექსტი ტექსტი ტექსტი ტექსტი          │
│          │                                          │
├──────────┴──────────────────────────────────────────┤
│  ReaderProgress — ████████░░░░ 67%                  │
└─────────────────────────────────────────────────────┘
```

### 3.2 კომპონენტები

**ReaderToolbar:**
- უკან ღილაკი
- TOC toggle (sidebar show/hide)
- Font settings dropdown (size, family, line-height)
- Theme switcher (light/sepia/dark)
- Bookmark current position
- Fullscreen toggle

**ReaderContent:**
- თავების rendering
- Highlight overlay (CSS ::selection + positioned spans)
- Text selection handler → popup (highlight/note)
- Scroll position tracking

**ReaderSidebar:**
- Table of Contents
- Bookmarks list
- Highlights list (with jump-to)
- Notes list

**TextSelection popup:**
- ტექსტის მონიშვნისას გამოჩნდება
- ფერის არჩევა (4 ფერი)
- "შენიშვნის დამატება"
- "კოპირება"

### 3.3 Reader Themes (SCSS)
```scss
// reader-themes.scss
[data-reader-theme="light"] {
  --reader-bg: #ffffff;
  --reader-text: #1a1a1a;
  --reader-sidebar: #f8f9fa;
}

[data-reader-theme="sepia"] {
  --reader-bg: #f4ecd8;
  --reader-text: #5b4636;
  --reader-sidebar: #ede4d3;
}

[data-reader-theme="dark"] {
  --reader-bg: #1a1a2e;
  --reader-text: #e0e0e0;
  --reader-sidebar: #16213e;
}
```

### 3.4 ქართული შრიფტები
```css
font-family options:
- "Noto Serif Georgian" — ლიტერატურული (default)
- "BPG Glaho" — კლასიკური ქართული
- "FiraGO" — თანამედროვე sans-serif
- System default
```

---

## ნაწილი 4: React Native App (Expo)

### 4.1 პროექტის სტრუქტურა
```
apps/mobile/
├── app/                    # Expo Router (file-based routing)
│   ├── (auth)/
│   │   ├── login.tsx
│   │   └── register.tsx
│   ├── (tabs)/
│   │   ├── library.tsx     # ბიბლიოთეკა
│   │   ├── search.tsx      # ძებნა
│   │   └── profile.tsx     # პროფილი
│   ├── book/[id].tsx       # წიგნის დეტალები
│   ├── reader/[id].tsx     # Reader
│   └── _layout.tsx
├── src/
│   ├── components/
│   │   ├── reader/
│   │   │   ├── ReaderContent.tsx     # ScrollView-based text
│   │   │   ├── ReaderToolbar.tsx     # Top bar
│   │   │   ├── ReaderBottomBar.tsx   # Progress + page controls
│   │   │   ├── TextSelectionMenu.tsx # Custom selection actions
│   │   │   └── AudioPlayer.tsx       # TTS player (Phase 6)
│   │   └── common/
│   │       ├── BookCard.tsx
│   │       └── LoadingSpinner.tsx
│   ├── hooks/
│   │   └── (uses packages/reader hooks)
│   ├── services/
│   │   ├── auth.ts         # Token management (SecureStore)
│   │   └── api.ts          # API client
│   └── theme/
│       └── colors.ts
├── package.json
├── app.json                # Expo config
└── tsconfig.json
```

### 4.2 ეკრანები

**Login/Register:**
- Email + პაროლი
- Google OAuth
- ტელეფონი + OTP
- იგივე API endpoints — `/api/auth/*`

**Library (ბიბლიოთეკა):**
- ნათარგმნი წიგნების grid
- პროგრესის ბარი თითოეულზე
- "გააგრძელე კითხვა" ღილაკი
- Pull-to-refresh

**Reader:**
- Swipe-based page navigation (ან scroll)
- Pinch-to-zoom font size
- Long press → highlight/note
- Bottom: progress bar + audio player
- Background audio playback (Phase 6)
- Lock screen controls (Phase 6)

**Profile:**
- ბიბლიოთეკა
- გადახდების ისტორია
- პარამეტრები (reader defaults)

### 4.3 React Native ბიბლიოთეკები
```json
{
  "expo": "~52",
  "expo-router": "~4",
  "expo-secure-store": "~14",       // token storage
  "expo-av": "~15",                  // audio playback (Phase 6)
  "react-native-gesture-handler": "~2.20",  // swipe, pinch
  "react-native-reanimated": "~3.16",       // animations
  "@react-native-async-storage/async-storage": "^2",  // settings cache
  "react-native-safe-area-context": "~5"
}
```

### 4.4 Authentication Flow (Mobile)
```
SecureStore (tokens) → API calls with Bearer token
                     → Token refresh (same /api/auth/refresh endpoint)
                     → Google OAuth via expo-auth-session
```

---

## ნაწილი 5: PWA Setup (Web)

**ეს მცირე დამატებაა — React Native-ს არ ცვლის, მაგრამ ვებ მომხმარებლებს ეხმარება:**

```
apps/web/public/
├── manifest.json          # App name, icons, theme
├── sw.js                  # Service Worker (cache translated chapters)
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

- "Add to Home Screen" prompt
- Cached chapters offline-ში კითხვისთვის
- Fullscreen mode

---

## შესრულების თანმიმდევრობა

### Sprint 1: Foundation (3-4 დღე)
| # | Task | Platform |
|---|---|---|
| 1 | Reader API Module (controller + service + DTOs) | Backend |
| 2 | `packages/reader/` — types + API client + hooks | Shared |
| 3 | Web ReaderView + ReaderContent (text rendering) | Web |
| 4 | Web ReaderToolbar (font, theme, fullscreen) | Web |
| 5 | ReadingProgress (auto-save + resume) | Both |

### Sprint 2: Interactive Features (3-4 დღე)
| # | Task | Platform |
|---|---|---|
| 6 | Bookmarks (API + Web UI) | Both |
| 7 | Highlights (text selection + colors) | Web |
| 8 | Notes (highlight-attached) | Web |
| 9 | ReaderSidebar (TOC + bookmarks + highlights) | Web |
| 10 | Mobile optimization (responsive, touch) | Web |

### Sprint 3: React Native Setup (3-4 დღე)
| # | Task | Platform |
|---|---|---|
| 11 | Expo project init + navigation | Mobile |
| 12 | Auth screens (login, register, Google OAuth) | Mobile |
| 13 | Library screen (book list, progress) | Mobile |
| 14 | Mobile ReaderScreen (basic) | Mobile |

### Sprint 4: Mobile Reader + Polish (3-4 დღე)
| # | Task | Platform |
|---|---|---|
| 15 | Mobile Reader (swipe, pinch-zoom, highlights) | Mobile |
| 16 | Mobile bookmarks + notes | Mobile |
| 17 | Sync (web-mobile reading position) | Both |
| 18 | PWA setup (manifest, service worker) | Web |

### Sprint 5: TTS Preparation (Phase 6 foundation)
| # | Task | Platform |
|---|---|---|
| 19 | Audio player UI (mobile) | Mobile |
| 20 | TTS API integration (Google Cloud TTS) | Backend |

**სულ: ~15-18 დღე (3-4 კვირა)**

---

## ტექნოლოგიური სტეკი — საბოლოო

| კომპონენტი | ტექნოლოგია |
|---|---|
| Web | Next.js 16 + React 19 + SCSS + next-intl |
| Mobile | Expo SDK 52 + Expo Router + React Native |
| Shared | packages/reader (TypeScript) |
| Backend | NestJS + Prisma + PostgreSQL |
| Auth | JWT + Passport.js (ორივე პლატფორმა) |
| Storage | AWS S3 (ფაილები) + PostgreSQL (მონაცემები) |
| Queue | BullMQ + Redis |
| AI | Claude Sonnet (Anthropic API) |
| TTS | Google Cloud TTS (Phase 6) |

---

## რა არ გადაიწერება არასდროს:

1. **packages/reader/** — hooks, API, types → ორივე პლატფორმა იყენებს
2. **Backend API** — ერთი API, ორი client
3. **DB Schema** — უკვე მზადაა reader + audio მოდელებისთვის
4. **Auth system** — JWT-based, ორივე პლატფორმა ერთნაირად იყენებს
