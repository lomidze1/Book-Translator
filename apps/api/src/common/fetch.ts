/**
 * fetch() wrapper that aborts the request after `timeoutMs` (default: 10s).
 *
 * Use everywhere we call out to external services (Google Books, Open Library,
 * S3, Flitt, ElevenLabs, Azure TTS, etc.) so that a slow upstream cannot pin a
 * worker thread indefinitely. The default of 10 seconds is conservative; pass
 * a higher value for endpoints that are known to be slow (e.g. Claude).
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 10_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
