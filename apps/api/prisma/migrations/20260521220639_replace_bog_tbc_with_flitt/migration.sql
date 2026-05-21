-- Replace BOG + TBC payment providers with Flitt (TBC Bank subsidiary).
-- Pre-production: any legacy payment rows using BOG/TBC are deleted.

DELETE FROM "Payment" WHERE provider IN ('BOG', 'TBC');

ALTER TYPE "PaymentProvider" RENAME TO "PaymentProvider_old";

CREATE TYPE "PaymentProvider" AS ENUM ('FLITT');

ALTER TABLE "Payment"
  ALTER COLUMN provider TYPE "PaymentProvider"
  USING provider::text::"PaymentProvider";

DROP TYPE "PaymentProvider_old";
