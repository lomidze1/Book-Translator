# Book Translator — API Endpoints

## Base URL
```
Production: https://api.book-translator.ge/v1
Development: http://localhost:4000/v1
```

## ავტორიზაცია
ყველა დაცულ endpoint-ს სჭირდება JWT token:
```
Authorization: Bearer <access_token>
```

---

## 1. Auth (ავტორიზაცია)

### POST `/auth/register`
Email-ით რეგისტრაცია.
```json
// Request
{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "გიორგი"
}

// Response 201
{
  "message": "Verification email sent",
  "userId": "clx..."
}
```

### POST `/auth/login`
ლოგინი.
```json
// Request
{
  "email": "user@example.com",
  "password": "securePassword123"
}

// Response 200
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": {
    "id": "clx...",
    "email": "user@example.com",
    "name": "გიორგი",
    "avatar": null
  }
}
```

### POST `/auth/refresh`
Access token-ის განახლება.
```json
// Request
{ "refreshToken": "eyJ..." }

// Response 200
{ "accessToken": "eyJ...", "refreshToken": "eyJ..." }
```

### POST `/auth/google`
Google OAuth ლოგინი.
```json
// Request
{ "idToken": "google_id_token_here" }

// Response 200
{ "accessToken": "...", "refreshToken": "...", "user": {...} }
```

### POST `/auth/phone/send-otp`
SMS OTP-ის გაგზავნა.
```json
// Request
{ "phone": "+995599123456" }

// Response 200
{ "message": "OTP sent", "expiresIn": 300 }
```

### POST `/auth/phone/verify-otp`
OTP-ის ვერიფიკაცია.
```json
// Request
{ "phone": "+995599123456", "code": "123456" }

// Response 200
{ "accessToken": "...", "refreshToken": "...", "user": {...} }
```

### POST `/auth/forgot-password`
პაროლის აღდგენის მოთხოვნა. Rate limit: 3 req / 15 min / email.
```json
// Request
{ "email": "user@example.com" }

// Response 200 (ყოველთვის — email-ის არსებობა არ ამჟღავნდება)
{ "message": "Reset link sent to email" }
```
**ლოგიკა:** crypto token → SHA-256 hash DB-ში → Resend-ით email გაგზავნა → 1 საათი ვადა.

### POST `/auth/reset-password`
ახალი პაროლის დაყენება reset token-ით.
```json
// Request
{
  "token": "64-char hex token from email link",
  "newPassword": "NewSecure123"
}

// Response 200
{ "message": "Password updated" }

// Response 400 (expired)
{ "statusCode": 400, "message": "Token expired, please request a new one" }

// Response 400 (invalid)
{ "statusCode": 400, "message": "Invalid token" }
```
**პაროლის მოთხოვნები:** min 8 სიმბოლო, uppercase + lowercase + ციფრი.

### GET `/auth/verify-email?token={token}`
Email-ის ვერიფიკაცია რეგისტრაციის შემდეგ.
```json
// Response 200
{ "message": "Email verified successfully" }

// Response 400 (expired — 24 საათის შემდეგ)
{ "statusCode": 400, "message": "Verification link expired" }
```

### POST `/auth/logout`
```json
// Request (Header: Authorization: Bearer ...)
// Response 200
{ "message": "Logged out" }
```

---

## 2. Users (მომხმარებლები)

### GET `/users/me` 🔒
მიმდინარე მომხმარებლის პროფილი.
```json
// Response 200
{
  "id": "clx...",
  "email": "user@example.com",
  "name": "გიორგი",
  "avatar": "https://s3.../avatar.jpg",
  "phone": "+995599123456",
  "role": "USER",
  "locale": "ka",
  "createdAt": "2026-03-17T10:00:00Z"
}
```

### PATCH `/users/me` 🔒
პროფილის რედაქტირება.
```json
// Request
{ "name": "გიორგი ბერიძე", "locale": "en" }

// Response 200
{ ...updatedUser }
```

### PATCH `/users/me/password` 🔒
პაროლის შეცვლა.
```json
// Request
{ "currentPassword": "old123", "newPassword": "new456" }
```

### DELETE `/users/me` 🔒
ანგარიშის წაშლა.

---

## 3. Books (წიგნები)

### GET `/books/search?q={query}&page={page}&limit={limit}` 🔒
წიგნების ძებნა (Google Books + Open Library + შიდა ბაზა).
```json
// Response 200
{
  "results": [
    {
      "title": "Clean Code",
      "author": "Robert C. Martin",
      "description": "A Handbook of Agile...",
      "coverUrl": "https://books.google.com/...",
      "isbn": "9780132350884",
      "buyLinks": [
        { "name": "Google Play", "url": "https://..." },
        { "name": "Amazon", "url": "https://..." }
      ],
      "source": "google_books",
      "inOurDatabase": true,
      "availableAs": {
        "original": { "available": true, "price": 1, "currency": "USD" },
        "translation": { "available": true, "price": 5, "currency": "GEL" }
      }
    }
  ],
  "totalResults": 42,
  "page": 1,
  "limit": 10
}
```

### POST `/books/upload` 🔒
წიგნის ატვირთვა (multipart/form-data).
```
Content-Type: multipart/form-data

file: <PDF/EPUB/TXT/DOCX file> (max 50MB)
title: "Clean Code" (optional — ავტო-ამოცნობა)
author: "Robert Martin" (optional)
```

```json
// Response 201
{
  "bookId": "clx...",
  "title": "Clean Code",
  "author": "Robert C. Martin",
  "format": "PDF",
  "pageCount": 464,
  "fileSize": 12345678,
  "duplicate": false,
  "message": "Book uploaded successfully"
}

// Response 200 (duplicate found)
{
  "duplicate": true,
  "existingBookId": "clx...",
  "translationAvailable": true,
  "offer": {
    "translationPrice": 5,
    "currency": "GEL",
    "message": "ეს წიგნი უკვე ნათარგმნია! შეგიძლია 5₾-ად შეიძინო."
  }
}
```

### GET `/books/{bookId}` 🔒
წიგნის დეტალები.
```json
// Response 200
{
  "id": "clx...",
  "title": "Clean Code",
  "author": "Robert C. Martin",
  "description": "...",
  "coverUrl": "...",
  "format": "PDF",
  "pageCount": 464,
  "chapters": [
    { "number": 1, "title": "Clean Code", "wordCount": 3500 },
    { "number": 2, "title": "Meaningful Names", "wordCount": 4200 }
  ]
}
```

### GET `/books/{bookId}/chapters/{chapterNumber}` 🔒
თავის შიგთავსის წაკითხვა.
```json
// Response 200
{
  "chapterNumber": 1,
  "title": "Clean Code",
  "content": "...", // ნათარგმნი ტექსტი (თუ ხელმისაწვდომია)
  "originalContent": "...", // ორიგინალი (თუ მოთხოვნილია)
  "wordCount": 3500
}
```

---

## 4. Translations (თარგმნა)

### POST `/translations` 🔒
თარგმნის დაწყება (გადახდის შემდეგ).
```json
// Request
{
  "bookId": "clx...",
  "targetLanguage": "ka"
}

// Response 201
{
  "translationId": "clx...",
  "status": "PENDING",
  "paymentRequired": true,
  "amount": 10,
  "currency": "GEL"
}
```

### GET `/translations/{translationId}` 🔒
თარგმნის სტატუსი.
```json
// Response 200
{
  "id": "clx...",
  "bookId": "clx...",
  "status": "IN_PROGRESS",
  "progress": 45.5,
  "currentChapter": 5,
  "totalChapters": 12,
  "startedAt": "2026-03-17T10:00:00Z",
  "estimatedCompletion": "2026-03-17T10:30:00Z"
}
```

### GET `/translations/{translationId}/chapters/{chapterNumber}` 🔒
ნათარგმნი თავის წაკითხვა.
```json
// Response 200
{
  "chapterNumber": 1,
  "originalContent": "...",
  "translatedContent": "...",
  "isEdited": false
}
```

### PATCH `/translations/{translationId}/chapters/{chapterNumber}` 🔒
ნათარგმნი თავის რედაქტირება.
```json
// Request
{ "editedContent": "რედაქტირებული ტექსტი..." }

// Response 200
{ "message": "Chapter updated", "isEdited": true }
```

### POST `/translations/{translationId}/purchase` 🔒
უკვე ნათარგმნი წიგნის შეძენა (5₾).
```json
// Request
{ "paymentProvider": "BOG" }

// Response 200 (redirect info)
{
  "paymentUrl": "https://ipay.ge/...",
  "orderId": "ord_..."
}
```

---

## 5. Payments (გადახდები)

### POST `/payments/create` 🔒
გადახდის შექმნა.
```json
// Request
{
  "translationId": "clx...",
  "type": "TRANSLATION", // TRANSLATION | PURCHASE_ORIGINAL | PURCHASE_TRANSLATION
  "provider": "BOG" // BOG | TBC
}

// Response 200
{
  "paymentId": "clx...",
  "paymentUrl": "https://ipay.ge/checkout/...",
  "orderId": "ord_123456",
  "amount": 10,
  "currency": "GEL"
}
```

### POST `/payments/bog/callback` (Webhook — no auth)
BOG Pay callback.
```json
// BOG sends confirmation
// Server validates and updates payment status
```

### POST `/payments/tbc/callback` (Webhook — no auth)
TBC Pay callback.

### GET `/payments/history` 🔒
გადახდების ისტორია.
```json
// Response 200
{
  "payments": [
    {
      "id": "clx...",
      "amount": 10,
      "currency": "GEL",
      "status": "COMPLETED",
      "type": "TRANSLATION",
      "description": "წიგნის თარგმნა: Clean Code",
      "provider": "BOG",
      "paidAt": "2026-03-17T10:05:00Z"
    }
  ],
  "total": 15,
  "page": 1
}
```

---

## 6. Library (ბიბლიოთეკა)

### GET `/library` 🔒
მომხმარებლის ბიბლიოთეკა.
```json
// Query params: ?status=reading&page=1&limit=20

// Response 200
{
  "books": [
    {
      "id": "clx...",
      "bookId": "clx...",
      "title": "Clean Code",
      "author": "Robert C. Martin",
      "coverUrl": "...",
      "type": "PURCHASED_TRANSLATION",
      "readingProgress": 45.5,
      "lastReadAt": "2026-03-17T10:00:00Z",
      "addedAt": "2026-03-15T09:00:00Z"
    }
  ],
  "total": 8,
  "page": 1
}
```

---

## 7. Reader (კითხვა)

### GET `/reader/{bookId}/content` 🔒
წიგნის სრული შიგთავსი (pagination-ით).
```json
// Query: ?chapter=1

// Response 200
{
  "bookId": "clx...",
  "title": "Clean Code",
  "chapter": {
    "number": 1,
    "title": "Clean Code",
    "content": "ნათარგმნი ტექსტი...",
    "wordCount": 3500
  },
  "totalChapters": 12,
  "tableOfContents": [
    { "number": 1, "title": "Clean Code" },
    { "number": 2, "title": "Meaningful Names" }
  ]
}
```

### PUT `/reader/{bookId}/progress` 🔒
კითხვის პროგრესის შენახვა.
```json
// Request
{
  "currentChapter": 3,
  "currentPosition": 1250,
  "percentage": 25.5
}
```

### GET `/reader/{bookId}/bookmarks` 🔒
სანიშნეების სია.

### POST `/reader/{bookId}/bookmarks` 🔒
სანიშნის დამატება.
```json
// Request
{
  "chapterNumber": 3,
  "position": 1250,
  "label": "მნიშვნელოვანი ადგილი"
}
```

### DELETE `/reader/bookmarks/{bookmarkId}` 🔒
სანიშნის წაშლა.

### GET `/reader/{bookId}/highlights` 🔒
ხაზგასმების სია.

### POST `/reader/{bookId}/highlights` 🔒
ხაზგასმის დამატება.
```json
// Request
{
  "chapterNumber": 3,
  "startPosition": 100,
  "endPosition": 250,
  "color": "yellow",
  "selectedText": "მონიშნული ტექსტი"
}
```

### POST `/reader/highlights/{highlightId}/notes` 🔒
შენიშვნის დამატება ხაზგასმასთან.
```json
// Request
{ "content": "ეს ადგილი ძალიან საინტერესოა..." }
```

---

## 8. TTS / ხმოვანი წაკითხვა (Voice Reader)

### POST `/tts/generate` 🔒
აუდიოს გენერაციის დაწყება წიგნისთვის.
```json
// Request
{
  "bookId": "clx...",
  "translationId": "clx...",
  "voiceId": "ka-GE-Standard-A", // optional — default voice
  "chapters": [1, 2, 3]          // optional — კონკრეტული თავები (ცარიელი = ყველა)
}

// Response 201
{
  "audioBookId": "clx...",
  "status": "PENDING",
  "totalChapters": 12,
  "estimatedDuration": "~15 წუთი"
}
```

### GET `/tts/{audioBookId}` 🔒
აუდიო წიგნის სტატუსი და ინფორმაცია.
```json
// Response 200
{
  "id": "clx...",
  "bookId": "clx...",
  "status": "IN_PROGRESS",
  "progress": 33.3,
  "totalChapters": 12,
  "completedChapters": 4,
  "voiceId": "ka-GE-Standard-A",
  "totalDuration": null,
  "chapters": [
    { "number": 1, "status": "COMPLETED", "duration": 320 },
    { "number": 2, "status": "COMPLETED", "duration": 280 },
    { "number": 3, "status": "COMPLETED", "duration": 350 },
    { "number": 4, "status": "COMPLETED", "duration": 290 },
    { "number": 5, "status": "GENERATING", "duration": null },
    { "number": 6, "status": "PENDING", "duration": null }
  ]
}
```

### GET `/tts/{audioBookId}/chapters/{chapterNumber}/stream` 🔒
აუდიო თავის streaming (მზა თავებისთვის).
```
// Response 200
Content-Type: audio/mpeg
Accept-Ranges: bytes
Content-Length: 4567890

<binary audio data>
```

### GET `/tts/{audioBookId}/chapters/{chapterNumber}/timestamps` 🔒
ტექსტ-აუდიო სინქრონიზაციის მონაცემები (კარაოკე რეჟიმისთვის).
```json
// Response 200
{
  "chapterNumber": 1,
  "duration": 320,
  "timestamps": [
    { "start": 0.0, "end": 2.5, "text": "პირველი წინადადება აქ იწყება." },
    { "start": 2.5, "end": 5.1, "text": "მეორე წინადადება გრძელდება." }
  ]
}
```

### GET `/tts/voices` 🔒
ხელმისაწვდომი ხმების სია.
```json
// Response 200
{
  "voices": [
    {
      "id": "ka-GE-Standard-A",
      "name": "ანა",
      "gender": "FEMALE",
      "language": "ka-GE",
      "preview": "https://s3.../voice-previews/ka-GE-Standard-A.mp3"
    },
    {
      "id": "ka-GE-Standard-B",
      "name": "გიორგი",
      "gender": "MALE",
      "language": "ka-GE",
      "preview": "https://s3.../voice-previews/ka-GE-Standard-B.mp3"
    }
  ]
}
```

### DELETE `/tts/{audioBookId}` 🔒
აუდიო წიგნის წაშლა (S3 ფაილების ჩათვლით).
```json
// Response 200
{ "message": "Audio book deleted" }
```

---

## 9. WebSocket Events (Socket.io)

### კლიენტი → სერვერი

| Event | მონაცემები | აღწერა |
|---|---|---|
| `join:translation` | `{ translationId }` | თარგმნის ოთახში შესვლა |
| `leave:translation` | `{ translationId }` | ოთახიდან გასვლა |
| `join:tts` | `{ audioBookId }` | TTS გენერაციის ოთახში შესვლა |
| `leave:tts` | `{ audioBookId }` | TTS ოთახიდან გასვლა |

### სერვერი → კლიენტი

| Event | მონაცემები | აღწერა |
|---|---|---|
| `translation:progress` | `{ translationId, progress, currentChapter, totalChapters }` | პროგრესის განახლება |
| `translation:chapter-done` | `{ translationId, chapterNumber, title }` | თავი გადათარგმნილია |
| `translation:completed` | `{ translationId }` | თარგმნა დასრულდა |
| `translation:failed` | `{ translationId, error }` | შეცდომა |
| `tts:progress` | `{ audioBookId, progress, currentChapter, totalChapters }` | TTS გენერაციის პროგრესი |
| `tts:chapter-done` | `{ audioBookId, chapterNumber, duration }` | თავის აუდიო მზადაა |
| `tts:completed` | `{ audioBookId, totalDuration }` | მთელი წიგნის აუდიო მზადაა |
| `tts:failed` | `{ audioBookId, chapterNumber, error }` | TTS შეცდომა |

---

## Error Responses

ყველა შეცდომა ერთიანი ფორმატით:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "ფაილის ფორმატი არ არის მხარდაჭერილი",
  "code": "INVALID_FILE_FORMAT"
}
```

### HTTP Status Codes

| კოდი | გამოყენება |
|---|---|
| 200 | წარმატება |
| 201 | შექმნილია (create) |
| 400 | არასწორი მონაცემები |
| 401 | არაავტორიზებული |
| 403 | წვდომა აკრძალულია |
| 404 | ვერ მოიძებნა |
| 409 | კონფლიქტი (მაგ: დუბლიკატი email) |
| 413 | ფაილი ძალიან დიდია |
| 429 | Rate limit exceeded |
| 500 | სერვერის შეცდომა |

---

## Rate Limiting

| Endpoint | ლიმიტი |
|---|---|
| `POST /auth/*` | 5 requests / წუთი / IP |
| `GET /books/search` | 30 requests / წუთი / user |
| `POST /books/upload` | 10 requests / საათი / user |
| `POST /translations` | 5 requests / საათი / user |
| `POST /tts/generate` | 5 requests / საათი / user |
| `GET /tts/*/stream` | 60 requests / წუთი / user |
| სხვა `GET` endpoints | 100 requests / წუთი / user |
| სხვა `POST/PATCH/DELETE` | 30 requests / წუთი / user |
