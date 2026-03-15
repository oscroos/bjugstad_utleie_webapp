CREATE TABLE "public"."machine_position_history" (
    "id" BIGSERIAL NOT NULL,
    "machine_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "reported_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "altitude" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "km" DOUBLE PRECISION,

    CONSTRAINT "machine_position_history_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_machine_position_history_machine_source_reported_at"
ON "public"."machine_position_history"("machine_id", "source", "reported_at");

CREATE INDEX "idx_machine_position_history_machine_reported_at"
ON "public"."machine_position_history"("machine_id", "reported_at" DESC);

CREATE INDEX "idx_machine_position_history_reported_at"
ON "public"."machine_position_history"("reported_at" DESC);

ALTER TABLE "public"."machine_position_history"
ADD CONSTRAINT "machine_position_history_machine_id_fkey"
FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
