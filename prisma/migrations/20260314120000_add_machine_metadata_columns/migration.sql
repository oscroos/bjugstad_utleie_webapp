-- AlterTable
ALTER TABLE "public"."machines"
ADD COLUMN "model" TEXT,
ADD COLUMN "production_year" TEXT,
ADD COLUMN "category" TEXT,
ADD COLUMN "registration_number" TEXT,
ADD COLUMN "rail_control_date" TIMESTAMP(3),
ADD COLUMN "control_date" TIMESTAMP(3),
ADD COLUMN "trackunit_id" TEXT,
ADD COLUMN "leasing_company" TEXT;
