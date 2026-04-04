# ფაზა 6: TTS (ხმოვანი წაკითხვა) — იმპლემენტაციის გეგმა

> **სტატუსი:** ✅ დასრულებული (100%)
> **პრიმარული პროვაიდერი:** Google Cloud TTS (Neural2)
> **არქიტექტურა:** BullMQ processor API მოდულში (არსებული pattern)
> **შეფასებული ეტაპები:** 9

---

## სარჩევი
1. [მიმდინარე მდგომარეობა](#1-მიმდინარე-მდგომარეობა)
2. [არქიტექტურა](#2-არქიტექტურა)
3. [ეტაპი 1: Google Cloud TTS პროვაიდერი](#ეტაპი-1-google-cloud-tts-პროვაიდერი)
4. [ეტაპი 2: Provider Fallback სისტემა](#ეტაპი-2-provider-fallback-და-health-check-სისტემა)
5. [ეტაპი 3: Backend API დახვეწა](#ეტაპი-3-backend-api-დახვეწა-და-ახალი-endpoints)
6. [ეტაპი 4: ვებ UI — Voice Selection & Generation](#ეტაპი-4-ვებ-ui--voice-selection-და-tts-generation)
7. [ეტაპი 5: ვებ AudioPlayer დახვეწა](#ეტაპი-5-ვებ-audioplayer-ის-დახვეწა)
8. [ეტაპი 6: მობილური აუდიო](#ეტაპი-6-მობილური-აუდიო-react-native)
9. [ეტაპი 7: ტესტირება](#ეტაპი-7-ტესტირების-სრული-suite)
10. [ეტაპი 8: კონფიგურაცია & Deployment](#ეტაპი-8-environment-configuration-და-deployment)
11. [ეტაპი 9: დოკუმენტაცია](#ეტაპი-9-დოკუმენტაცია-და-roadmap-განახლება)

---

## 1. მიმდინარე მდგომარეობა

### რა არის მზად ✅

| კომპონენტი | ფაილი | სტატუსი |
|---|---|---|
| DB მოდელები (AudioBook, AudioChapter) | `prisma/schema.prisma` | ✅ სრული |
| TTS Module სტრუქტურა | `src/tts/tts.module.ts` | ✅ სრული |
| TTS Service (synthesis, status, stream, delete) | `src/tts/tts.service.ts` | ✅ სრული |
| TTS Controller (7 endpoints) | `src/tts/tts.controller.ts` | ✅ სრული |
| TTS Processor (BullMQ worker) | `src/tts/tts.processor.ts` | ✅ სრული |
| WebSocket Gateway (progress events) | `src/tts/tts.gateway.ts` | ✅ სრული |
| ElevenLabs Provider | `src/tts/providers/elevenlabs.provider.ts` | ✅ სრული |
| Azure Provider | `src/tts/providers/azure.provider.ts` | ✅ ნაწილობრივი |
| Provider Interface | `src/tts/providers/tts-provider.interface.ts` | ✅ სრული |
| ტექსტის ფრაგმენტაცია (ქართული-aware) | `src/tts/utils/text-chunker.ts` | ✅ სრული |
| აუდიო კონკატენაცია (ffmpeg) | `src/tts/utils/audio-concat.ts` | ✅ სრული |
| DTOs (SynthesizeDto, SynthesizeBookDto) | `src/tts/dto/synthesize.dto.ts` | ✅ სრული |
| ვებ AudioPlayer (ბაზისური) | `apps/web/.../AudioPlayer.tsx` | ✅ ბაზისური |
| ტესტები (11 ფაილი, 1,141+ ხაზი) | `test/tts/` | ✅ ნაწილობრივი |

### რა აკლია ❌

| კომპონენტი | პრიორიტეტი | სირთულე |
|---|---|---|
| Google Cloud TTS პროვაიდერი | 🔴 მაღალი | საშუალო |
| Provider fallback/health-check | 🔴 მაღალი | საშუალო |
| ვებ UI: ხმის არჩევა, generation panel | 🔴 მაღალი | საშუალო |
| Karaoke-style ტექსტის sync (ბაზისური) | 🟡 საშუალო | მაღალი |
| მობილური: Background playback | 🔴 მაღალი | მაღალი |
| მობილური: Lock screen controls | 🔴 მაღალი | საშუალო |
| მობილური: Offline download | 🟡 საშუალო | მაღალი |
| Cost tracking & rate limiting | 🟡 საშუალო | დაბალი |
| ინტეგრაციული ტესტები | 🟡 საშუალო | საშუალო |
| დოკუმენტაციის განახლება | 🟢 დაბალი | დაბალი |

---

## 2. არქიტექტურა

### მონაცემთა ნაკადი

```
მომხმარებელი: "გადაიყვანე აუდიოდ"
        │
        ▼
┌─────────────────────────────────┐
│  TtsController                  │
│  POST /tts/synthesize-book      │
└─────────┬───────────────────────┘
          │
          ▼
┌─────────────────────────────────┐
│  TtsService                     │
│  - Ownership validation         │
│  - AudioBook/Chapter records    │
│  - BullMQ job creation          │
└─────────┬───────────────────────┘
          │  Redis Queue (tts-audio)
          ▼
┌─────────────────────────────────┐
│  TtsProcessor (BullMQ Worker)   │
│  1. text-chunker → chunks       │
│  2. ProviderManager → audio     │
│  3. ffmpeg → concatenation      │
│  4. S3 → upload                 │
│  5. DB → status update          │
└─────────┬───────────────────────┘
          │  WebSocket
          ▼
┌─────────────────────────────────┐
│  TtsGateway (Socket.io)         │
│  tts:progress, tts:chapter-done │
│  tts:completed, tts:error       │
└─────────┬───────────────────────┘
          │
          ▼
┌─────────────────────────────────┐
│  Frontend AudioPlayer           │
│  - Streaming via presigned URL  │
│  - Karaoke highlighting         │
│  - Mobile: background playback  │
└─────────────────────────────────┘
```

### Provider არქიტექტურა

```
              ProviderManager
              /      |       \
       Google Cloud  ElevenLabs  Azure
       (primary/ka)  (en/premium) (fallback)
```

- **Google Cloud TTS** — პრიმარული ქართულისთვის (Neural2, $4/1M სიმბოლო)
- **ElevenLabs** — პრემიუმ ხარისხი ინგლისურისთვის ($5/1M სიმბოლო)
- **Azure** — fallback (უკვე ნაწილობრივ იმპლემენტირებული)

### S3 ფაილების სტრუქტურა

```
books/
  {bookId}/
    original.pdf
    audio/
      {audioBookId}/
        chapter-1.mp3
        chapter-2.mp3
        ...
```

---

## ეტაპი 1: Google Cloud TTS პროვაიდერი

### ახალი ფაილები
- `apps/api/src/tts/providers/google-cloud.provider.ts`
- `apps/api/test/tts/providers/google-cloud.provider.spec.ts`

### განსახვნელი ფაილები
- `apps/api/src/tts/providers/tts-provider.interface.ts` — `getName()` method დამატება interface-ში
- `apps/api/src/tts/tts.module.ts` — GoogleCloudProvider providers-ში
- `apps/api/src/tts/tts.service.ts` — default provider → google-cloud

### იმპლემენტაციის დეტალები

**GoogleCloudProvider კლასი:**
```typescript
@Injectable()
export class GoogleCloudProvider implements TtsProvider {
  private client: TextToSpeechClient;

  synthesize(text: string, options: TtsOptions): Promise<TtsSynthesisResult>
  // - Neural2 voice: ka-GE-Neural2-A (მდედრობითი), ka-GE-Neural2-B (მამრობითი)
  // - SSML wrapping: <speak><prosody rate="X">text</prosody></speak>
  // - Audio config: MP3, 24000Hz sample rate
  // - Max input: 5000 bytes per request

  getVoices(language?: string): Promise<Voice[]>
  // - listVoices API call + ენის ფილტრი
  // - Return: id, name, gender, language, provider

  getMaxChunkSize(): number  // 5000
  isAvailable(): Promise<boolean>  // health check with listVoices
  getName(): string  // 'google-cloud'
}
```

**SSML მხარდაჭერა ქართულისთვის:**
```xml
<speak>
  <prosody rate="1.0" pitch="0st">
    ქართული ტექსტი აქ...
  </prosody>
</speak>
```

**Dependency:**
```bash
cd apps/api && pnpm add @google-cloud/text-to-speech
```

**Environment Variables:**
```env
GOOGLE_CLOUD_TTS_CREDENTIALS_PATH=/path/to/service-account.json
GOOGLE_CLOUD_TTS_PROJECT_ID=book-translator-prod
```

### ტესტები (google-cloud.provider.spec.ts)
- ✅ synthesize — successful MP3 generation
- ✅ synthesize — empty text → error
- ✅ synthesize — API error handling (401, 429, 500)
- ✅ synthesize — rate limit retry-after header
- ✅ synthesize — timeout handling (30s)
- ✅ synthesize — SSML wrapping verification
- ✅ getVoices — Georgian voices filter (ka-GE)
- ✅ getVoices — all languages
- ✅ getVoices — empty API key → empty array
- ✅ getMaxChunkSize — returns 5000
- ✅ isAvailable — API reachable → true
- ✅ isAvailable — API unreachable → false
- ✅ isAvailable — timeout → false

---

## ეტაპი 2: Provider Fallback და Health-Check სისტემა

### ახალი ფაილები
- `apps/api/src/tts/providers/provider-manager.ts`
- `apps/api/test/tts/providers/provider-manager.spec.ts`

### განსახვნელი ფაილები
- `apps/api/src/tts/tts.service.ts` — `getProvider()` → `ProviderManager`
- `apps/api/src/tts/tts.processor.ts` — `getProvider()` → `ProviderManager`
- `apps/api/src/tts/tts.module.ts` — ProviderManager providers-ში

### იმპლემენტაციის დეტალები

**ProviderManager კლასი:**
```typescript
@Injectable()
export class ProviderManager implements OnModuleInit, OnModuleDestroy {
  private healthStatus: Map<string, boolean>;
  private healthCheckInterval: NodeJS.Timeout;

  // Provider priority: [google-cloud, elevenlabs, azure]
  getProvider(preferred?: string, language?: string): TtsProvider
  // 1. preferred provider available? → return it
  // 2. language-based selection: ka → google-cloud, en → elevenlabs
  // 3. fallback chain: primary → secondary → tertiary

  synthesizeWithFallback(text: string, options: TtsOptions): Promise<TtsSynthesisResult>
  // Try primary → catch → try next → catch → try next → throw

  estimateCost(charCount: number, provider?: string): CostEstimate
  // { provider, costUsd, charCount }

  getAvailableProviders(): ProviderInfo[]
  // [{ name, available, languages, costPerMillion }]
}
```

**Health-Check:**
- ყოველ 5 წუთში `isAvailable()` გამოძახება ყველა provider-ზე
- Redis-ში status caching (სწრაფი lookup)
- ConfigService-დან interval configuration

**Cost Estimation:**
```typescript
interface CostEstimate {
  provider: string;
  charCount: number;
  costUsd: number;
  estimatedDurationMinutes: number;
}

// ფასები: Google $4/1M, ElevenLabs $5/1M, Azure $4/1M
// დრო: ~150 სიმბოლო/წამი → 1M სიმბოლო ≈ 111 წუთი აუდიო
```

### ტესტები (provider-manager.spec.ts)
- ✅ getProvider — returns preferred provider when available
- ✅ getProvider — fallback when preferred unavailable
- ✅ getProvider — language-based selection (ka → google, en → elevenlabs)
- ✅ getProvider — all providers down → throws
- ✅ synthesizeWithFallback — primary success → no fallback
- ✅ synthesizeWithFallback — primary fails → secondary success
- ✅ synthesizeWithFallback — all fail → throws with all errors
- ✅ estimateCost — correct calculation per provider
- ✅ health-check — periodic check updates status
- ✅ health-check — provider goes down → status updates
- ✅ health-check — provider recovers → status updates

---

## ეტაპი 3: Backend API დახვეწა და ახალი Endpoints

### განსახვნელი ფაილები
- `apps/api/src/tts/tts.controller.ts`
- `apps/api/src/tts/tts.service.ts`
- `apps/api/src/tts/dto/synthesize.dto.ts`

### ახალი ტესტ ფაილები
- `apps/api/test/tts/tts.retry.spec.ts`
- `apps/api/test/tts/tts.estimate.spec.ts`

### ახალი Endpoints

#### `GET /tts/voices?language=ka`
ხმების ჩამონათვალი preview URL-ებით.
```json
// Response 200
{
  "voices": [
    {
      "id": "ka-GE-Neural2-A",
      "name": "Georgian Female Neural",
      "gender": "female",
      "language": "ka-GE",
      "provider": "google-cloud",
      "previewUrl": "https://..."
    }
  ]
}
```

#### `GET /tts/estimate`
ფასის და დროის ესტიმაცია.
```json
// Query: ?bookId=xxx&voiceId=ka-GE-Neural2-A
// Response 200
{
  "totalChapters": 12,
  "totalCharacters": 245000,
  "estimatedCostUsd": 0.98,
  "estimatedDurationMinutes": 27,
  "estimatedAudioHours": 2.3,
  "provider": "google-cloud"
}
```

#### `POST /tts/retry/:audioBookId`
წარუმატებელი თავების ხელახალი სინთეზი.
```json
// Response 200
{
  "audioBookId": "xxx",
  "retriedChapters": [3, 7],
  "status": "queued"
}
```

#### `GET /tts/:audioBookId/timestamps/:chapterNumber`
Karaoke timestamps (chunk-level).
```json
// Response 200
{
  "chapterNumber": 1,
  "timestamps": [
    { "text": "პირველი აბზაცი...", "startMs": 0, "endMs": 4500 },
    { "text": "მეორე აბზაცი...", "startMs": 4500, "endMs": 9200 }
  ]
}
```

### DTO განახლებები

```typescript
// EstimateTtsDto (ახალი)
export class EstimateTtsDto {
  @IsUUID() bookId: string;
  @IsOptional() @IsString() voiceId?: string;
  @IsOptional() @IsIn(['google-cloud', 'elevenlabs', 'azure']) provider?: string;
}

// SynthesizeDto — ახალი ველები
@IsOptional() @IsIn(['standard', 'premium']) quality?: string;
@IsOptional() @Matches(/^[a-z]{2}(-[A-Z]{2})?$/) language?: string;

// SynthesizeBookDto — ახალი ველები
@IsOptional() @IsIn(['standard', 'premium']) quality?: string;
@IsOptional() @IsArray() @IsInt({ each: true }) chapters?: number[];  // specific chapters only
```

### ტესტები

**tts.retry.spec.ts:**
- ✅ retry — re-queues FAILED chapters only
- ✅ retry — no failed chapters → returns empty
- ✅ retry — ownership validation
- ✅ retry — audioBook not found → 404

**tts.estimate.spec.ts:**
- ✅ estimate — calculates cost for google-cloud
- ✅ estimate — calculates cost for elevenlabs
- ✅ estimate — book with no completed translation → 404
- ✅ estimate — ownership validation

---

## ეტაპი 4: ვებ UI — Voice Selection და TTS Generation

### ახალი ფაილები
- `apps/web/src/app/[locale]/books/[id]/read/components/VoiceSelector.tsx`
- `apps/web/src/app/[locale]/books/[id]/read/components/TtsGenerationPanel.tsx`
- `apps/web/src/app/[locale]/books/[id]/read/components/TtsProgressBar.tsx`

### განსახვნელი ფაილები
- `apps/web/src/app/[locale]/books/[id]/read/reader.module.scss`
- `apps/web/src/app/[locale]/books/[id]/read/page.tsx` (TTS panel ინტეგრაცია)
- `apps/web/messages/ka.json`
- `apps/web/messages/en.json`

### კომპონენტები

#### VoiceSelector
```
┌─────────────────────────────────┐
│  ხმის არჩევა                    │
│  ┌───────────────┐  ┌──────┐   │
│  │ Georgian Female▼│  │ ▶ 🔊 │   │
│  └───────────────┘  └──────┘   │
│  ♀ მდედრობითი  ♂ მამრობითი    │
└─────────────────────────────────┘
```

**ფუნქციონალი:**
- Dropdown: ხმების სია API-დან (`GET /tts/voices?language=ka`)
- Preview button: 5-წამიანი სემპლი არჩეული ხმით
- Gender filter: მამრობითი / მდედრობითი ტოგლი
- ბოლო არჩეული ხმა localStorage-ში

#### TtsGenerationPanel
```
┌─────────────────────────────────────┐
│  📖 აუდიო გენერაცია                 │
│                                     │
│  ხმა: [Georgian Female Neural ▼]    │
│  სიჩქარე: [1.0x ▼]                 │
│                                     │
│  ≈ 2.3 საათი აუდიო | ~$0.98       │
│  12 თავი | 245,000 სიმბოლო         │
│                                     │
│  [ გადაიყვანე აუდიოდ ]             │
└─────────────────────────────────────┘
```

**ფუნქციონალი:**
- VoiceSelector ინტეგრაცია
- Speed selection (0.5x, 0.75x, 1.0x, 1.25x, 1.5x, 2.0x)
- ფასის/დროის ესტიმაცია (`GET /tts/estimate`)
- Confirm modal გენერაციის დაწყებამდე
- `POST /tts/synthesize-book` გამოძახება

#### TtsProgressBar
```
┌─────────────────────────────────────┐
│  🔊 აუდიო გენერირდება...            │
│  ████████████░░░░░░░░  58%         │
│  თავი 7/12 | დარჩა ≈ 4 წუთი       │
│                               [✕]  │
└─────────────────────────────────────┘
```

**ფუნქციონალი:**
- Socket.io subscription: `tts:progress`, `tts:chapter-done`, `tts:completed`
- თავების ინდივიდუალური პროგრესი
- ETA გამოთვლა (საშუალო სიჩქარე × დარჩენილი)
- გაუქმების ღილაკი

### i18n ქილითები

**ka.json-ში დასამატებელი:**
```json
{
  "tts": {
    "generateAudio": "აუდიოდ გადაყვანა",
    "selectVoice": "ხმის არჩევა",
    "voicePreview": "მოსმენა",
    "speed": "სიჩქარე",
    "estimatedTime": "სავარაუდო დრო",
    "estimatedCost": "სავარაუდო ფასი",
    "generating": "აუდიო გენერირდება...",
    "chapterProgress": "თავი {current}/{total}",
    "completed": "აუდიო მზადაა",
    "failed": "გენერაცია ვერ მოხერხდა",
    "retry": "ხელახლა ცდა",
    "cancel": "გაუქმება",
    "remaining": "დარჩა ≈ {minutes} წუთი",
    "male": "მამრობითი",
    "female": "მდედრობითი",
    "confirmGeneration": "დაადასტურეთ აუდიო გენერაცია",
    "estimatedAudioLength": "სავარაუდო ხანგრძლივობა: {hours} საათი",
    "noTranslation": "ჯერ არ არის ნათარგმნი"
  }
}
```

---

## ეტაპი 5: ვებ AudioPlayer-ის დახვეწა

### განსახვნელი ფაილები
- `apps/web/src/app/[locale]/books/[id]/read/components/AudioPlayer.tsx`
- `apps/web/src/app/[locale]/books/[id]/read/reader.module.scss`

### ახალი ფაილები
- `apps/web/src/app/[locale]/books/[id]/read/components/KaraokeHighlight.tsx`

### AudioPlayer ახალი ფუნქციონალი

**ამჟამინდელი (რა გვაქვს):**
- ✅ Play/Pause, ±15s skip, prev/next chapter
- ✅ Speed selection (0.5x - 2x)
- ✅ Sleep timer (15, 30, 60 min)
- ✅ Progress bar (range input)
- ✅ Media Session API (lock screen)
- ✅ Auto-advance to next chapter
- ✅ Minimize/expand toggle

**დასამატებელი:**
- Volume control slider
- Chapter list dropdown (სწრაფი ნავიგაცია)
- Download button (ინდივიდუალური თავი)
- Queue indicator (მიმდინარე / შემდეგი)
- Error recovery (auto-retry on load failure)
- Keyboard shortcuts:
  - `Space` — Play/Pause
  - `←` `→` — ±15 წამი
  - `Shift+←` `Shift+→` — წინა/შემდეგი თავი
  - `↑` `↓` — Volume ±10%

### KaraokeHighlight (ბაზისური ვერსია)

**მუშაობის პრინციპი:**
1. API-დან timestamps ინფორმაცია (chunk-level, არა სიტყვა-level):
   ```json
   [
     { "text": "პირველი წინადადება...", "startMs": 0, "endMs": 4500 },
     { "text": "მეორე წინადადება...", "startMs": 4500, "endMs": 9200 }
   ]
   ```
2. AudioPlayer `timeupdate` event → currentTime
3. currentTime ↔ timestamps matching → active chunk index
4. Active chunk: background highlight ფერი (theme-aware)
5. Auto-scroll: active chunk viewport-ში

**ინტეგრაცია:**
```
AudioPlayer ──timeupdate──► KaraokeHighlight ──highlight──► ReaderView
                                    │
ReaderView ──click-on-chunk──► AudioPlayer (seek to chunk startMs)
```

**SCSS:**
```scss
.karaokeActive {
  background-color: rgba(var(--accent-rgb), 0.15);
  border-radius: 4px;
  transition: background-color 0.3s ease;
}

.karaokeDark .karaokeActive {
  background-color: rgba(var(--accent-rgb), 0.25);
}
```

---

## ეტაპი 6: მობილური აუდიო (React Native)

### ახალი ფაილები
- `apps/mobile/src/components/audio/MobileAudioPlayer.tsx`
- `apps/mobile/src/components/audio/MiniPlayer.tsx`
- `apps/mobile/src/components/audio/AudioDownloadManager.tsx`
- `apps/mobile/src/hooks/useAudioPlayer.ts`
- `apps/mobile/src/hooks/useAudioDownload.ts`
- `apps/mobile/src/services/audio-cache.ts`
- `apps/mobile/src/services/playback-service.ts`

### განსახვნელი ფაილები
- `apps/mobile/app.json` — background mode, permissions

### 6.1 Background Playback

**react-native-track-player setup:**
```typescript
// playback-service.ts
import TrackPlayer, { Event } from 'react-native-track-player';

export async function setupPlayer() {
  await TrackPlayer.setupPlayer({
    maxCacheSize: 1024 * 50, // 50MB cache
  });

  await TrackPlayer.updateOptions({
    capabilities: [
      Capability.Play, Capability.Pause,
      Capability.SkipToNext, Capability.SkipToPrevious,
      Capability.SeekTo, Capability.Stop,
    ],
    compactCapabilities: [Capability.Play, Capability.Pause],
    notificationCapabilities: [Capability.Play, Capability.Pause, Capability.SeekTo],
  });
}
```

**Track loading:**
```typescript
// chapters → tracks mapping
const tracks: Track[] = audioChapters.map(ch => ({
  id: ch.audioChapterId,
  url: ch.streamUrl,
  title: `თავი ${ch.chapterNumber}`,
  artist: bookTitle,
  artwork: bookCoverUrl,
  duration: ch.duration / 1000,
}));

await TrackPlayer.add(tracks);
```

### 6.2 Lock Screen Controls

**iOS:** `UIBackgroundModes: ["audio"]` in `app.json`
**Android:** `FOREGROUND_SERVICE` permission + Notification channel

**Metadata:**
```typescript
TrackPlayer.updateNowPlayingMetadata({
  title: `თავი ${currentChapter}`,
  artist: bookTitle,
  artwork: bookCoverUrl,
  duration: chapterDuration,
  elapsedTime: currentPosition,
});
```

### 6.3 Bluetooth / AirPods

**Headphone Controls:**
```typescript
TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext());
TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious());
```

### 6.4 Offline Download

**AudioDownloadManager:**
```typescript
class AudioDownloadManager {
  // ჩამოტვირთვა ფონში
  async downloadChapter(audioChapterId: string, url: string): Promise<string>

  // ავტომატური: შემდეგი 2-3 თავი Wi-Fi-ზე
  async prefetchNextChapters(currentChapter: number, bookChapters: AudioChapter[]): Promise<void>

  // Storage management
  async getCacheSize(): Promise<number>
  async clearCache(): Promise<void>
  async clearOldCache(maxAge: number): Promise<void>

  // Download status
  getDownloadProgress(chapterId: string): number | null
  isDownloaded(chapterId: string): boolean
}
```

**audio-cache.ts:**
```typescript
// FileSystem-based cache
const CACHE_DIR = `${FileSystem.cacheDirectory}audio/`;
const MAX_CACHE_SIZE = 500 * 1024 * 1024; // 500MB

async function getCachedAudioPath(chapterId: string): string | null
async function cacheAudio(chapterId: string, url: string): Promise<string>
async function cleanupCache(): Promise<void>
```

### 6.5 MobileAudioPlayer UI

**Full-screen view:**
```
┌──────────────────────────────┐
│          წიგნის ყდა           │
│        [cover image]          │
│                               │
│    ✦ წიგნის სახელი ✦         │
│       თავი 3 / 12            │
│                               │
│  0:45 ████████░░░░░░ 3:22    │
│                               │
│    ⏮   ◀15   ▶⏸   15▶   ⏭   │
│                               │
│  [1.0x]  [⏰ Sleep]  [📥]    │
└──────────────────────────────┘
```

**Mini-player (bottom bar):**
```
┌──────────────────────────────┐
│ [▶] თავი 3  ████░░░  [⏭]   │
└──────────────────────────────┘
```

### 6.6 app.json განახლება

```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "UIBackgroundModes": ["audio"]
      }
    },
    "android": {
      "permissions": [
        "android.permission.FOREGROUND_SERVICE",
        "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK"
      ]
    },
    "plugins": [
      ["react-native-track-player"]
    ]
  }
}
```

### Dependencies
```bash
cd apps/mobile && npx expo install expo-av expo-file-system
cd apps/mobile && pnpm add react-native-track-player
```

---

## ეტაპი 7: ტესტირების სრული Suite

### Backend ტესტები (`apps/api/test/tts/`)

#### ახალი ტესტ ფაილები

| ფაილი | ტესტები | აღწერა |
|---|---|---|
| `providers/google-cloud.provider.spec.ts` | 13 | Google Cloud TTS mock tests |
| `providers/provider-manager.spec.ts` | 11 | Fallback, health-check, cost |
| `tts.retry.spec.ts` | 4 | Retry failed chapters |
| `tts.estimate.spec.ts` | 4 | Cost/time estimation |
| `tts.integration.spec.ts` | 6 | E2E flow tests |
| `tts.concurrent.spec.ts` | 3 | Concurrent requests |
| `tts.cleanup.spec.ts` | 3 | S3 cleanup, cascades |

#### არსებული ტესტების განახლება

| ფაილი | ცვლილება |
|---|---|
| `tts.service.spec.ts` | ProviderManager integration |
| `tts.processor.spec.ts` | Google Cloud provider tests |
| `tts.controller.spec.ts` | ახალი endpoints (retry, estimate, timestamps) |

#### ინტეგრაციული ტესტები (tts.integration.spec.ts)

```typescript
describe('TTS E2E Flow', () => {
  it('synthesize book → process chapters → stream audio');
  it('WebSocket: receives progress events during synthesis');
  it('provider fallback: primary down → secondary succeeds');
  it('caching: re-request same chapter → returns cached');
  it('retry: failed chapters re-queued successfully');
  it('delete: removes S3 files and DB records');
});
```

#### Concurrent ტესტები (tts.concurrent.spec.ts)

```typescript
describe('Concurrent TTS', () => {
  it('multiple users synthesizing simultaneously');
  it('same book different voices → separate AudioBooks');
  it('duplicate request → returns existing (no re-queue)');
});
```

### სულ ტესტ ფაილები: 18 (11 არსებული + 7 ახალი)
### სავარაუდო ტესტ ხაზები: ~2,500+

---

## ეტაპი 8: Environment, Configuration და Deployment

### ახალი Dependencies

**API (`apps/api/package.json`):**
```json
{
  "@google-cloud/text-to-speech": "^5.x"
}
```

**Mobile (`apps/mobile/package.json`):**
```json
{
  "react-native-track-player": "^4.x",
  "expo-av": "^14.x",
  "expo-file-system": "^17.x"
}
```

### Environment Variables — სრული სია

```env
# ═══════════════════════════════════
# TTS Configuration (Phase 6)
# ═══════════════════════════════════

# --- Provider Selection ---
TTS_PRIMARY_PROVIDER=google-cloud          # google-cloud | elevenlabs | azure
TTS_FALLBACK_PROVIDERS=elevenlabs,azure    # comma-separated fallback order
TTS_HEALTH_CHECK_INTERVAL_MS=300000        # 5 minutes

# --- Google Cloud TTS ---
GOOGLE_CLOUD_TTS_CREDENTIALS_PATH=        # /path/to/service-account.json
GOOGLE_CLOUD_TTS_PROJECT_ID=              # GCP project ID

# --- ElevenLabs (already configured) ---
ELEVENLABS_API_KEY=
ELEVENLABS_DEFAULT_VOICE_ID=
ELEVENLABS_MODEL_ID=eleven_v3

# --- Azure (already configured) ---
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=westeurope

# --- Audio Processing ---
TTS_CHUNK_MAX_BYTES=5000                   # per-request text limit
TTS_MAX_CONCURRENT_JOBS=2                  # BullMQ concurrency
TTS_AUDIO_FORMAT=mp3
TTS_AUDIO_BITRATE=128k
TTS_AUDIO_SAMPLE_RATE=24000
TTS_CROSSFADE_MS=50                        # crossfade between chunks

# --- Streaming & Cache ---
TTS_PRESIGNED_URL_EXPIRY=14400             # 4 hours
TTS_DEFAULT_QUALITY=standard               # standard | premium

# --- Cost Tracking ---
TTS_COST_PER_MILLION_CHARS_GOOGLE=4        # USD
TTS_COST_PER_MILLION_CHARS_ELEVENLABS=5    # USD
TTS_COST_PER_MILLION_CHARS_AZURE=4         # USD
TTS_MONTHLY_BUDGET_LIMIT=100               # USD
```

### Docker განახლება

ffmpeg უკვე ხელმისაწვდომია `audio-concat.ts`-ით. თუ Docker image-ში არ არის:
```dockerfile
# Dockerfile (apps/api)
RUN apt-get update && apt-get install -y ffmpeg
```

---

## ეტაპი 9: დოკუმენტაცია და ROADMAP განახლება

### განსახვნელი ფაილები

| ფაილი | ცვლილება |
|---|---|
| `docs/ROADMAP.md` | ფაზა 6 ამოცანების სტატუსები ❌ → ✅ |
| `docs/API.md` | ახალი TTS endpoints (estimate, retry, timestamps) |
| `docs/ARCHITECTURE.md` | ProviderManager, fallback architecture |
| `docs/FEATURES.md` | TTS ფუნქციონალის განახლება (providers, mobile) |

### ROADMAP.md ცვლილებები (ეტაპობრივად)

ყოველი ეტაპის დასრულებისას შესაბამისი ამოცანა ✅-ით მოინიშნოს:

```markdown
| Google Cloud TTS API ინტეგრაცია | ✅ | ✅ |  ← ეტაპი 1 შემდეგ
| BullMQ — აუდიო გენერაციის job queue | ✅ | ✅ |  ← ეტაპი 2 შემდეგ
| ტექსტის ფრაგმენტებად დაყოფა | ✅ | ✅ |  ← უკვე მზადაა
| ffmpeg — ფრაგმენტების შეერთება | ✅ | ✅ |  ← უკვე მზადაა
| S3 — აუდიო ფაილების შენახვა და streaming | ✅ | ✅ |  ← ეტაპი 3 შემდეგ
...
```

---

## იმპლემენტაციის თანმიმდევრობა

```
ეტაპი 1 ──► ეტაპი 2 ──► ეტაპი 3 ──┐
(Google TTS)  (Fallback)   (API)     │
                                     ├──► ეტაპი 7 ──► ეტაპი 8 ──► ეტაპი 9
ეტაპი 4 ──► ეტაპი 5 ──────────────┤    (Tests)     (Config)    (Docs)
(Voice UI)   (Player+Karaoke)       │
                                     │
ეტაპი 6 ──────────────────────────┘
(Mobile Audio)
```

**პარალელიზაციის შესაძლებლობა:**
- ეტაპები 4-5 (ვებ UI) ‖ ეტაპი 3 (Backend API)
- ეტაპი 6 (მობილური) ‖ ეტაპები 4-5 (ვებ UI)
- ეტაპი 7 (ტესტები) იწყება თითოეული ეტაპის დასრულებისას

---

## ვერიფიკაცია

### Backend ტესტები
```bash
cd apps/api && npx vitest run --filter tts
cd apps/api && npx vitest run --coverage
```

### E2E ვერიფიკაცია
1. `docker-compose up -d` (PostgreSQL + Redis)
2. API start → TTS endpoints accessible
3. Upload book → Translate → Synthesize → Stream audio
4. WebSocket: progress events received in browser
5. Provider fallback: disable primary → fallback activates
6. Retry: intentionally fail chapter → retry succeeds
7. Mobile: background playback continues after minimize

### Frontend ვერიფიკაცია
1. Reader page → AudioPlayer visible
2. VoiceSelector: voices load from API, preview plays
3. TtsGenerationPanel: estimation shows, generation starts
4. TtsProgressBar: real-time progress via WebSocket
5. KaraokeHighlight: text highlights in sync with audio
6. Keyboard shortcuts: Space, arrows work correctly
7. Responsive: mobile viewport layout correct
