# Book Translator — მონაცემთა ბაზის სქემა

## ტექნოლოგია
- **PostgreSQL 16** — ძირითადი მონაცემთა ბაზა
- **Prisma ORM** — type-safe queries, მიგრაციები
- **Redis** — caching, session, job queue

---

## ER დიაგრამა (Entity Relationship)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│    User      │────<│   Payment    │     │    BookSearch     │
│              │     └──────────────┘     │   (cache/log)    │
│              │                          └──────────────────┘
│              │────<┌──────────────┐
│              │     │  UserBook    │────>┌──────────────┐
│              │     │ (ბიბლიოთეკა)│     │    Book      │
└──────────────┘     └──────────────┘     │              │
       │                    │             │              │
       │                    │             └──────────────┘
       │                    │                    │
       │             ┌──────────────┐            │
       │             │  Translation │────────────┘
       │             └──────────────┘
       │                    │
       │             ┌──────────────┐     ┌──────────────┐
       │             │  Chapter     │────<│ AudioChapter │
       │             └──────────────┘     └──────────────┘
       │                    │                    │
       ├────<┌──────────────┐            ┌──────────────┐
       │     │  Bookmark    │            │  AudioBook   │
       │     └──────────────┘            └──────────────┘
       │
       ├────<┌──────────────┐
       │     │  Highlight   │
       │     └──────────────┘
       │
       └────<┌──────────────┐
             │ReadingProgress│
             └──────────────┘
```

---

## ცხრილების დეტალური სქემა

### User (მომხმარებელი)

```prisma
model User {
  id            String    @id @default(cuid())
  email         String?   @unique
  emailVerified DateTime?
  phone         String?   @unique
  phoneVerified Boolean   @default(false)
  passwordHash  String?
  name          String?
  avatar        String?   // S3 URL
  role          Role      @default(USER)
  locale        String    @default("ka") // ka, en

  // Relations
  accounts      Account[]     // OAuth accounts
  books         UserBook[]    // ბიბლიოთეკა
  payments      Payment[]
  bookmarks     Bookmark[]
  highlights    Highlight[]
  notes         Note[]
  readingProgress ReadingProgress[]

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

enum Role {
  USER
  ADMIN
}
```

### Account (OAuth ანგარიშები)

```prisma
model Account {
  id                String  @id @default(cuid())
  userId            String
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  provider          String  // "google", "phone"
  providerAccountId String
  refreshToken      String?
  accessToken       String?
  expiresAt         Int?

  @@unique([provider, providerAccountId])
}
```

### Book (წიგნი)

```prisma
model Book {
  id              String    @id @default(cuid())
  title           String
  author          String?
  description     String?
  isbn            String?   @unique
  coverUrl        String?   // ყდის სურათი
  language        String    @default("en") // ორიგინალის ენა
  pageCount       Int?
  fileHash        String?   @unique // დუბლიკატის შემოწმება

  // S3 paths
  originalFileUrl String?   // ორიგინალი ფაილის S3 path
  originalFormat  FileFormat
  fileSize        Int?      // bytes

  // მეტადატა (Google Books / Open Library)
  googleBooksId   String?
  openLibraryId   String?
  buyLinks        Json?     // [{name: "Amazon", url: "..."}]

  // Relations
  translations    Translation[]
  userBooks       UserBook[]
  chapters        Chapter[]       // ორიგინალი თავები
  audioBooks      AudioBook[]     // აუდიო ვერსიები

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

enum FileFormat {
  PDF
  EPUB
  TXT
  DOCX
}
```

### Chapter (თავი)

```prisma
model Chapter {
  id              String    @id @default(cuid())
  bookId          String
  book            Book      @relation(fields: [bookId], references: [id], onDelete: Cascade)

  number          Int       // თავის ნომერი
  title           String?   // თავის სათაური
  originalContent String    // ორიგინალი ტექსტი (English)
  wordCount       Int?

  // Relations
  translatedChapters TranslatedChapter[]
  audioChapters      AudioChapter[]      // აუდიო ვერსიები

  @@unique([bookId, number])
}
```

### Translation (თარგმანი)

```prisma
model Translation {
  id              String            @id @default(cuid())
  bookId          String
  book            Book              @relation(fields: [bookId], references: [id])

  sourceLanguage  String            @default("en")
  targetLanguage  String            @default("ka")
  status          TranslationStatus @default(PENDING)
  progress        Float             @default(0) // 0-100%

  // AI მეტადატა
  aiModel         String?           // "claude-sonnet-4-6"
  totalTokensUsed Int?
  glossary        Json?             // {characterNames: {...}, terms: {...}}

  // Relations
  translatedChapters TranslatedChapter[]
  audioBooks      AudioBook[]
  payment         Payment?

  startedAt       DateTime?
  completedAt     DateTime?
  errorMessage    String?

  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
}

enum TranslationStatus {
  PENDING       // გადახდის მოლოდინში
  PAID          // გადახდილი, რიგში
  IN_PROGRESS   // მთარგმნელობს
  COMPLETED     // დასრულებული
  FAILED        // შეცდომა
}
```

### TranslatedChapter (ნათარგმნი თავი)

```prisma
model TranslatedChapter {
  id              String      @id @default(cuid())
  translationId   String
  translation     Translation @relation(fields: [translationId], references: [id], onDelete: Cascade)
  chapterId       String
  chapter         Chapter     @relation(fields: [chapterId], references: [id])

  translatedContent String    // ქართული ტექსტი
  editedContent     String?   // მომხმარებლის რედაქტირებული ვერსია
  isEdited          Boolean   @default(false)

  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  @@unique([translationId, chapterId])
}
```

### UserBook (მომხმარებლის ბიბლიოთეკა)

```prisma
model UserBook {
  id              String    @id @default(cuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  bookId          String
  book            Book      @relation(fields: [bookId], references: [id])

  type            UserBookType // UPLOADED, PURCHASED_ORIGINAL, PURCHASED_TRANSLATION
  translationId   String?      // თუ თარგმანი აქვს

  addedAt         DateTime  @default(now())

  @@unique([userId, bookId, type])
}

enum UserBookType {
  UPLOADED               // მომხმარებელმა ატვირთა
  PURCHASED_ORIGINAL     // იყიდა ინგლისური (1$)
  PURCHASED_TRANSLATION  // იყიდა/თარგმნა ქართული (5₾/10₾)
}
```

### Payment (გადახდა)

```prisma
model Payment {
  id              String        @id @default(cuid())
  userId          String
  user            User          @relation(fields: [userId], references: [id])
  translationId   String?       @unique
  translation     Translation?  @relation(fields: [translationId], references: [id])

  amount          Decimal       // თანხა
  currency        String        @default("GEL") // GEL, USD
  status          PaymentStatus @default(PENDING)

  provider        PaymentProvider // BOG, TBC
  providerOrderId String?       // ბანკის order ID
  providerTxId    String?       // ბანკის ტრანზაქციის ID

  type            PaymentType   // TRANSLATION, PURCHASE_ORIGINAL, PURCHASE_TRANSLATION
  description     String?       // "წიგნის თარგმნა: Clean Code"

  paidAt          DateTime?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
}

enum PaymentStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
  REFUNDED
}

enum PaymentProvider {
  BOG   // საქართველოს ბანკი
  TBC   // თიბისი
}

enum PaymentType {
  TRANSLATION          // ახალი თარგმანი (10₾)
  PURCHASE_ORIGINAL    // ინგლისური წიგნი ბაზიდან (1$)
  PURCHASE_TRANSLATION // ნათარგმნი წიგნი ბაზიდან (5₾)
}
```

### Bookmark (სანიშნე)

```prisma
model Bookmark {
  id              String    @id @default(cuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  bookId          String

  chapterNumber   Int
  position        Int       // სიმბოლოს პოზიცია ტექსტში
  label           String?   // მომხმარებლის სახელი სანიშნისთვის

  createdAt       DateTime  @default(now())

  @@unique([userId, bookId, chapterNumber, position])
}
```

### Highlight (ხაზგასმა)

```prisma
model Highlight {
  id              String    @id @default(cuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  bookId          String

  chapterNumber   Int
  startPosition   Int
  endPosition     Int
  color           String    @default("yellow") // yellow, green, blue, red
  selectedText    String    // მონიშნული ტექსტი

  // Relations
  notes           Note[]

  createdAt       DateTime  @default(now())
}
```

### Note (შენიშვნა)

```prisma
model Note {
  id              String     @id @default(cuid())
  userId          String
  user            User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  highlightId     String?
  highlight       Highlight? @relation(fields: [highlightId], references: [id], onDelete: Cascade)

  bookId          String
  chapterNumber   Int
  content         String     // შენიშვნის ტექსტი

  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt
}
```

### ReadingProgress (კითხვის პროგრესი)

```prisma
model ReadingProgress {
  id              String    @id @default(cuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  bookId          String

  currentChapter  Int       @default(1)
  currentPosition Int       @default(0)
  percentage      Float     @default(0) // 0-100

  lastReadAt      DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@unique([userId, bookId])
}
```

### AudioBook (აუდიო წიგნი)

```prisma
model AudioBook {
  id              String           @id @default(cuid())
  bookId          String
  book            Book             @relation(fields: [bookId], references: [id], onDelete: Cascade)
  translationId   String
  translation     Translation      @relation(fields: [translationId], references: [id])

  language        String           @default("ka") // აუდიოს ენა
  voiceId         String           // Google TTS voice ID (მაგ: "ka-GE-Standard-A")
  status          AudioStatus      @default(PENDING)
  progress        Float            @default(0) // 0-100%

  totalDuration   Int?             // სრული ხანგრძლივობა (წამები)
  totalSize       Int?             // სრული ზომა (bytes)
  totalChapters   Int              @default(0)
  completedChapters Int            @default(0)

  // Relations
  chapters        AudioChapter[]

  startedAt       DateTime?
  completedAt     DateTime?
  errorMessage    String?

  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  @@unique([bookId, translationId, voiceId])
}

enum AudioStatus {
  PENDING       // რიგში
  IN_PROGRESS   // გენერირდება
  COMPLETED     // დასრულებული
  FAILED        // შეცდომა
  PARTIAL       // ნაწილობრივ მზადაა (ზოგიერთი თავი მზადაა)
}
```

### AudioChapter (აუდიო თავი)

```prisma
model AudioChapter {
  id              String        @id @default(cuid())
  audioBookId     String
  audioBook       AudioBook     @relation(fields: [audioBookId], references: [id], onDelete: Cascade)
  chapterId       String
  chapter         Chapter       @relation(fields: [chapterId], references: [id])

  chapterNumber   Int
  audioUrl        String?       // S3 URL (მაგ: "audio/books/{bookId}/chapters/{num}.mp3")
  duration        Int?          // ხანგრძლივობა (წამები)
  fileSize        Int?          // ფაილის ზომა (bytes)
  format          String        @default("mp3") // mp3, ogg, wav

  status          AudioChapterStatus @default(PENDING)

  // სინქრონიზაცია ტექსტთან
  timestamps      Json?         // [{start: 0, end: 2.5, text: "პირველი წინადადება"}, ...]

  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  @@unique([audioBookId, chapterNumber])
}

enum AudioChapterStatus {
  PENDING       // ჯერ არ დაწყებულა
  GENERATING    // გენერირდება
  COMPLETED     // მზადაა
  FAILED        // შეცდომა
}
```

---

## ინდექსები

```prisma
// ხშირად გამოყენებული queries-ისთვის
@@index([userId])           // User-ის ყველა ცხრილში
@@index([bookId])           // Book-ის ყველა ცხრილში
@@index([status])           // Translation, Payment
@@index([createdAt])        // სორტირება თარიღით
@@index([fileHash])         // Book — დუბლიკატის ძებნა
@@index([isbn])             // Book — ISBN ძებნა
@@index([googleBooksId])    // Book — Google Books ID
```

---

## Redis-ის გამოყენება

| Key Pattern | დანიშნულება | TTL |
|---|---|---|
| `session:{userId}` | Refresh token | 30 დღე |
| `otp:{phone}` | SMS OTP კოდი | 5 წუთი |
| `email-verify:{token}` | Email verification | 24 საათი |
| `password-reset:{token}` | Password reset link | 1 საათი |
| `rate-limit:{ip}:{endpoint}` | Rate limiting | 1 წუთი |
| `book-search:{query}` | ძებნის cache | 1 საათი |
| `translation-progress:{id}` | თარგმნის პროგრესი | persistent |
| `bull:translation:*` | BullMQ translation jobs | persistent |
| `tts-progress:{audioBookId}` | TTS გენერაციის პროგრესი | persistent |
| `bull:tts:*` | BullMQ TTS jobs | persistent |
| `audio-cache:{bookId}:{chapter}` | აუდიო streaming cache | 24 საათი |

## Docker Setup

PostgreSQL და Redis Docker Compose-ით ეშვება:

```bash
# კონტეინერების გაშვება
docker-compose up -d

# კონტეინერების გაჩერება
docker-compose down

# Prisma მიგრაცია
cd apps/api && npx prisma migrate dev
```

### Connection URLs (Development)
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/book_translator
REDIS_URL=redis://localhost:6379
```
