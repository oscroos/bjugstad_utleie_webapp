-- CreateEnum
CREATE TYPE "public"."ContractType" AS ENUM ('NS_8405', 'NS_8406', 'NS_8407', 'NS_8417', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."ClientType" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "public"."KpiMetric" AS ENUM ('MAX_CO2_KG', 'MAX_IDLE_PCT', 'MIN_ELECTRIC_PCT', 'MIN_HVO_PCT', 'MAX_DIESEL_LITERS', 'MIN_MASS_REUSE_PCT', 'CUSTOM');

-- AlterTable
ALTER TABLE "public"."projects"
ADD COLUMN "contract_type" "public"."ContractType",
ADD COLUMN "contract_size_nok" DOUBLE PRECISION,
ADD COLUMN "client_type" "public"."ClientType",
ADD COLUMN "client_name" TEXT,
ADD COLUMN "client_address" TEXT,
ADD COLUMN "client_email" TEXT,
ADD COLUMN "client_contact_name" TEXT,
ADD COLUMN "client_contact_email" TEXT,
ADD COLUMN "client_contact_phone" TEXT;

-- CreateTable
CREATE TABLE "public"."project_kpis" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "metric" "public"."KpiMetric" NOT NULL,
    "label" TEXT NOT NULL,
    "target_value" DOUBLE PRECISION NOT NULL,
    "current_value" DOUBLE PRECISION,
    "unit" TEXT NOT NULL,
    "contract_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_kpis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_projects_client_name" ON "public"."projects"("client_name");

-- CreateIndex
CREATE INDEX "idx_project_kpis_project_id" ON "public"."project_kpis"("project_id");

-- AddForeignKey
ALTER TABLE "public"."project_kpis" ADD CONSTRAINT "project_kpis_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
