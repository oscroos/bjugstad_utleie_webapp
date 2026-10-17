-- CreateEnum
CREATE TYPE "public"."TelemetryProvider" AS ENUM (
    'BJUGSTAD',
    'CAT',
    'HYDREMA',
    'TRACKUNIT',
    'TELTONIKA',
    'MICTRACK',
    'VOLVO_CE',
    'KOMATSU',
    'SCANIA',
    'VOLVO_TRUCKS',
    'HITACHI',
    'LIEBHERR',
    'JCB',
    'OTHER'
);

-- CreateEnum
CREATE TYPE "public"."MachineOperatingStatus" AS ENUM ('WORKING', 'IDLE', 'OFF');

-- AlterTable
ALTER TABLE "public"."machines"
ADD COLUMN "ignition" BOOLEAN,
ADD COLUMN "operating_status" "public"."MachineOperatingStatus",
ADD COLUMN "last_position_source" TEXT;

-- CreateTable
CREATE TABLE "public"."machine_telemetry_links" (
    "id" TEXT NOT NULL,
    "machine_id" TEXT NOT NULL,
    "provider" "public"."TelemetryProvider" NOT NULL,
    "external_id" TEXT NOT NULL,
    "credential_ref" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3),
    "last_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machine_telemetry_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."machine_telemetry_snapshots" (
    "id" TEXT NOT NULL,
    "machine_id" TEXT NOT NULL,
    "project_id" TEXT,
    "provider" "public"."TelemetryProvider" NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "engine_hours" DOUBLE PRECISION,
    "idle_hours" DOUBLE PRECISION,
    "fuel_liters" DOUBLE PRECISION,
    "energy_kwh" DOUBLE PRECISION,
    "distance_km" DOUBLE PRECISION,
    "payload_tonnes" DOUBLE PRECISION,
    "calculation_method" TEXT NOT NULL DEFAULT 'PROVIDER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machine_telemetry_snapshots_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "public"."machine_position_history"
ADD COLUMN "project_id" TEXT,
ADD COLUMN "telemetry_link_id" TEXT,
ADD COLUMN "provider_event_id" TEXT,
ADD COLUMN "ignition" BOOLEAN,
ADD COLUMN "operating_status" "public"."MachineOperatingStatus",
ADD COLUMN "engine_hours" DOUBLE PRECISION,
ADD COLUMN "fuel_liters" DOUBLE PRECISION,
ADD COLUMN "energy_kwh" DOUBLE PRECISION,
ADD COLUMN "payload_tonnes" DOUBLE PRECISION;

-- Backfill existing Trackunit links without changing current Machine.trackunitId behavior.
INSERT INTO "public"."machine_telemetry_links" (
    "id",
    "machine_id",
    "provider",
    "external_id",
    "active",
    "last_seen_at",
    "last_sync_at",
    "created_at",
    "updated_at"
)
SELECT
    'tml_' || md5('TRACKUNIT:' || "trackunit_id"),
    "id",
    'TRACKUNIT'::"public"."TelemetryProvider",
    "trackunit_id",
    true,
    "last_pos_reported_at",
    "last_updated",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "public"."machines"
WHERE "trackunit_id" IS NOT NULL AND btrim("trackunit_id") <> ''
ON CONFLICT DO NOTHING;

-- CreateIndex
CREATE UNIQUE INDEX "uq_machine_telemetry_links_provider_external"
ON "public"."machine_telemetry_links"("provider", "external_id");

CREATE INDEX "idx_machine_telemetry_links_machine_active"
ON "public"."machine_telemetry_links"("machine_id", "active");

CREATE INDEX "idx_machine_telemetry_links_last_seen_at"
ON "public"."machine_telemetry_links"("last_seen_at" DESC);

CREATE UNIQUE INDEX "uq_machine_telemetry_snapshots_period"
ON "public"."machine_telemetry_snapshots"("machine_id", "provider", "period_start", "period_end");

CREATE INDEX "idx_machine_telemetry_snapshots_project_period"
ON "public"."machine_telemetry_snapshots"("project_id", "period_start");

CREATE INDEX "idx_machine_telemetry_snapshots_machine_period"
ON "public"."machine_telemetry_snapshots"("machine_id", "period_start");

CREATE UNIQUE INDEX "uq_machine_position_history_provider_event"
ON "public"."machine_position_history"("machine_id", "source", "provider_event_id");

CREATE INDEX "idx_machine_position_history_project_reported_at"
ON "public"."machine_position_history"("project_id", "reported_at" DESC);

CREATE INDEX "idx_machine_position_history_link_reported_at"
ON "public"."machine_position_history"("telemetry_link_id", "reported_at" DESC);

-- AddForeignKey
ALTER TABLE "public"."machine_telemetry_links"
ADD CONSTRAINT "machine_telemetry_links_machine_id_fkey"
FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."machine_telemetry_snapshots"
ADD CONSTRAINT "machine_telemetry_snapshots_machine_id_fkey"
FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."machine_telemetry_snapshots"
ADD CONSTRAINT "machine_telemetry_snapshots_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."machine_position_history"
ADD CONSTRAINT "machine_position_history_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."machine_position_history"
ADD CONSTRAINT "machine_position_history_telemetry_link_id_fkey"
FOREIGN KEY ("telemetry_link_id") REFERENCES "public"."machine_telemetry_links"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
