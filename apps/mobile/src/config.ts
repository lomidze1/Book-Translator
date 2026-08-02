/**
 * Single source of truth for build-time configuration.
 *
 * `process.env.EXPO_PUBLIC_*` is inlined at bundle time, so a variable missing
 * from the EAS build profile produces a shipped binary with no way to recover at
 * runtime. Twelve call sites used to default to `http://localhost:4000`, which
 * on a real device means "this phone" — a store build would have silently talked
 * to nothing, and iOS ATS would have blocked the plaintext URL anyway.
 * Fail loudly here instead.
 */

const rawApiUrl = process.env.EXPO_PUBLIC_API_URL;

function resolveApiUrl(): string {
  if (rawApiUrl) return rawApiUrl.replace(/\/+$/, '');

  // Dev convenience only. __DEV__ is false in every release build, so a
  // misconfigured store build throws at startup rather than shipping broken.
  if (__DEV__) return 'http://localhost:4000';

  throw new Error(
    'EXPO_PUBLIC_API_URL is not set. Add it to the EAS build profile in eas.json.',
  );
}

export const API_URL = resolveApiUrl();

/**
 * In-app purchasing is OFF for the first release.
 *
 * Translations are digital content consumed inside the app, so paying for them
 * through an external web checkout violates Apple Guideline 3.1.1 and the
 * equivalent Google Play Billing policy. Guideline 3.1.3 anti-steering also
 * forbids pointing users at the website to buy, so there is no CTA and no link.
 *
 * The payment code is intentionally kept, not deleted — flip this on once the
 * app ships StoreKit / Play Billing, or for a build that doesn't go to a store.
 */
export const PURCHASES_ENABLED = process.env.EXPO_PUBLIC_ENABLE_PURCHASES === 'true';

/**
 * Audio / TTS playback. Paused for the first release alongside the web app's
 * ENABLE_TTS. The players and cache under src/components/audio, src/hooks and
 * src/services/audio-cache are kept for release 2-3.
 *
 * Turning this back on ALSO requires restoring the native declarations removed
 * from app.json for store review: ios.infoPlist.UIBackgroundModes ["audio"] and
 * the android FOREGROUND_SERVICE / FOREGROUND_SERVICE_MEDIA_PLAYBACK permissions.
 * Both stores reject those while no audio feature ships.
 */
export const TTS_ENABLED = process.env.EXPO_PUBLIC_ENABLE_TTS === 'true';

/** Public web app — used only for legal pages, never for purchase steering. */
export const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://booktranslator.ge';
