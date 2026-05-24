import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Idempotent seed. The only thing it does today is promote one existing
// user to ADMIN — set INITIAL_ADMIN_EMAIL in your .env and run
// `pnpm prisma db seed` (or `npx prisma db seed`). Safe to re-run.
//
// We deliberately do NOT create the admin account here: every account in
// this app has an email-verified, hashed-password identity (or a Google
// SSO identity) — minting one from a seed would skip that and leave a
// dangling, unowned-but-privileged login behind.
async function main(): Promise<void> {
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) {
    console.log('[seed] INITIAL_ADMIN_EMAIL not set — skipping admin promotion.');
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.warn(
      `[seed] INITIAL_ADMIN_EMAIL is "${email}" but no such user exists yet.\n` +
        '       Register at /register first, then re-run the seed.',
    );
    return;
  }

  if (user.role === 'ADMIN') {
    console.log(`[seed] ${email} is already ADMIN — nothing to do.`);
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { role: 'ADMIN' },
  });
  console.log(`[seed] Promoted ${email} to ADMIN.`);
}

main()
  .catch(err => {
    console.error('[seed] Failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
