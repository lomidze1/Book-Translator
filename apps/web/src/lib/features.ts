/**
 * Audio (TTS) is paused for launch. Set NEXT_PUBLIC_ENABLE_TTS=true to bring it back.
 * The API enforces the same pause via ENABLE_TTS (see tts-enabled.guard.ts).
 */
export const TTS_ENABLED = process.env.NEXT_PUBLIC_ENABLE_TTS === 'true';

/**
 * Free translation preview. Must match the API's ENABLE_PREVIEW — the API gates
 * generation (see preview-enabled.guard.ts), this only hides the UI.
 */
export const PREVIEW_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PREVIEW === 'true';

/** Kept in sync with PREVIEW_WORD_COUNT in apps/api/src/preview/preview.constants.ts. */
export const PREVIEW_PAGES = 4;
