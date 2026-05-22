/**
 * Fail-secure gate for development-only shortcuts.
 *
 * Previously these paths were guarded only by `NODE_ENV !== 'production'`,
 * which fails open: any misconfigured deploy (NODE_ENV empty, 'staging',
 * 'test', a typo) unlocked free translations and arbitrary status changes.
 *
 * The check now requires BOTH:
 *   1. NODE_ENV === 'development' (explicit allow-listed value)
 *   2. ENABLE_DEV_SHORTCUTS === 'true' (must be opted into per-environment)
 *
 * If either is missing, the shortcut is disabled. Production deploys must
 * never set ENABLE_DEV_SHORTCUTS=true.
 */
export function devShortcutsEnabled(): boolean {
  return (
    process.env.NODE_ENV === 'development' &&
    process.env.ENABLE_DEV_SHORTCUTS === 'true'
  );
}
