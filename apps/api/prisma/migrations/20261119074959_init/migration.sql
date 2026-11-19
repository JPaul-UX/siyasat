-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checks" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "checked_at" TIMESTAMPTZ(3) NOT NULL,
    "doc" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_results" (
    "check_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "verdict" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "check_results_pkey" PRIMARY KEY ("check_id","kind","idx")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_token_hash_key" ON "workspaces"("token_hash");

-- CreateIndex
CREATE INDEX "checks_workspace_id_deleted_at_checked_at_idx" ON "checks"("workspace_id", "deleted_at", "checked_at" DESC);

-- CreateIndex
CREATE INDEX "check_results_check_id_kind_verdict_idx" ON "check_results"("check_id", "kind", "verdict");

-- AddForeignKey
ALTER TABLE "checks" ADD CONSTRAINT "checks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_results" ADD CONSTRAINT "check_results_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "checks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
