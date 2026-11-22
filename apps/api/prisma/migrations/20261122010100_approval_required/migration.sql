-- New accounts wait for the super admin's approval.
ALTER TABLE "users" ADD COLUMN "reviewed_at" TIMESTAMPTZ(3);
ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'pending';
CREATE INDEX "users_status_idx" ON "users"("status");

-- Accounts made before sign-ups needed approval wait for it too. The super admin needs none.
UPDATE "users" SET "status" = 'pending' WHERE "role" = 'user' AND "status" = 'active';
