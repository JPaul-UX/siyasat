-- Sign-ups that wait for the super admin's approval, and sign-ups the super admin declined.
-- Added in a migration of their own: Postgres cannot use a new enum value in the transaction that adds it.
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'pending' BEFORE 'active';
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'rejected';
