/**
 * Clamp page / limit query params to safe ranges and translate them into
 * Prisma `skip` / `take` values.
 *
 * Defaults: page=1, limit=100. Max limit per request is 200, so list endpoints
 * cannot be turned into a DoS by passing limit=10000.
 */
export function clampPagination(
  page: number | undefined,
  limit: number | undefined,
  options: { defaultLimit?: number; maxLimit?: number } = {},
): { skip: number; take: number; page: number; limit: number } {
  const defaultLimit = options.defaultLimit ?? 100;
  const maxLimit = options.maxLimit ?? 200;

  const safePage = Math.max(1, Number.isFinite(page) ? Number(page) : 1);
  const requestedLimit = Number.isFinite(limit) ? Number(limit) : defaultLimit;
  const safeLimit = Math.min(Math.max(1, requestedLimit), maxLimit);

  return {
    skip: (safePage - 1) * safeLimit,
    take: safeLimit,
    page: safePage,
    limit: safeLimit,
  };
}
