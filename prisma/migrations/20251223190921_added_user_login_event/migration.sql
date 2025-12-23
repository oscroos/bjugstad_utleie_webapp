-- CreateTable
CREATE TABLE "public"."user_login_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT,
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_login_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_user_login_events_logged_at" ON "public"."user_login_events"("logged_at");

-- AddForeignKey
ALTER TABLE "public"."user_login_events" ADD CONSTRAINT "user_login_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
