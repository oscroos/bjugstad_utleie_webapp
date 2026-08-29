-- CreateEnum
CREATE TYPE "public"."ProjectStatus" AS ENUM ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."ProjectRole" AS ENUM ('OWNER', 'PROJECT_MANAGER', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "public"."FieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'SELECT', 'BOOLEAN');

-- CreateTable
CREATE TABLE "public"."projects" (
    "id" TEXT NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "project_number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "address_line" TEXT,
    "postal_code" TEXT,
    "city" TEXT,
    "status" "public"."ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."project_participants" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "public"."ProjectRole" NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."mass_type_catalogs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'm3',
    "default_classification" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "tonn_per_m3" DOUBLE PRECISION NOT NULL DEFAULT 1.6,
    "swell_factor" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mass_type_catalogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."project_mass_types" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "mass_type_id" TEXT NOT NULL,
    "planned_in" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "planned_out" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_mass_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."project_field_definitions" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "field_type" "public"."FieldType" NOT NULL DEFAULT 'TEXT',
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "required" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."project_field_values" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "definition_id" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."audit_logs" (
    "id" TEXT NOT NULL,
    "customer_id" INTEGER,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_projects_customer_project_number" ON "public"."projects"("customer_id", "project_number");

-- CreateIndex
CREATE INDEX "idx_projects_customer_id" ON "public"."projects"("customer_id");

-- CreateIndex
CREATE INDEX "idx_projects_status" ON "public"."projects"("status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_project_participants_project_user" ON "public"."project_participants"("project_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_project_participants_project_id" ON "public"."project_participants"("project_id");

-- CreateIndex
CREATE INDEX "idx_project_participants_user_id" ON "public"."project_participants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "mass_type_catalogs_name_key" ON "public"."mass_type_catalogs"("name");

-- CreateIndex
CREATE INDEX "idx_mass_type_catalogs_active_sort_order" ON "public"."mass_type_catalogs"("active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "uq_project_mass_types_project_mass_type" ON "public"."project_mass_types"("project_id", "mass_type_id");

-- CreateIndex
CREATE INDEX "idx_project_mass_types_project_id" ON "public"."project_mass_types"("project_id");

-- CreateIndex
CREATE INDEX "idx_project_mass_types_mass_type_id" ON "public"."project_mass_types"("mass_type_id");

-- CreateIndex
CREATE INDEX "idx_project_field_definitions_active_sort_order" ON "public"."project_field_definitions"("active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "uq_project_field_values_project_definition" ON "public"."project_field_values"("project_id", "definition_id");

-- CreateIndex
CREATE INDEX "idx_project_field_values_project_id" ON "public"."project_field_values"("project_id");

-- CreateIndex
CREATE INDEX "idx_project_field_values_definition_id" ON "public"."project_field_values"("definition_id");

-- CreateIndex
CREATE INDEX "idx_audit_logs_customer_created_at" ON "public"."audit_logs"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_audit_logs_user_created_at" ON "public"."audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_audit_logs_entity" ON "public"."audit_logs"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "public"."projects" ADD CONSTRAINT "projects_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("customer_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."projects" ADD CONSTRAINT "projects_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_participants" ADD CONSTRAINT "project_participants_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_participants" ADD CONSTRAINT "project_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_mass_types" ADD CONSTRAINT "project_mass_types_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_mass_types" ADD CONSTRAINT "project_mass_types_mass_type_id_fkey" FOREIGN KEY ("mass_type_id") REFERENCES "public"."mass_type_catalogs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_field_values" ADD CONSTRAINT "project_field_values_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_field_values" ADD CONSTRAINT "project_field_values_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "public"."project_field_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
