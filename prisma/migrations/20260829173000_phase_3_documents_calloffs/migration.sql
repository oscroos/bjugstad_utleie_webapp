-- CreateEnum
CREATE TYPE "public"."FolderKind" AS ENUM ('SYSTEM', 'PROJECT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "public"."CallOffStatus" AS ENUM ('DRAFT', 'SENT', 'PRICED_BY_LESSOR', 'ACTIVE', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "public"."doc_folders" (
    "id" TEXT NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "parent_id" TEXT,
    "name" TEXT NOT NULL,
    "kind" "public"."FolderKind" NOT NULL DEFAULT 'CUSTOM',
    "system_key" TEXT,
    "project_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doc_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."doc_files" (
    "id" TEXT NOT NULL,
    "folder_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "storage_key" TEXT,
    "size_bytes" INTEGER,
    "content_type" TEXT,
    "uploaded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."call_offs" (
    "id" TEXT NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "number" TEXT,
    "frame_agreement_ref" TEXT NOT NULL,
    "status" "public"."CallOffStatus" NOT NULL DEFAULT 'DRAFT',
    "sent_at" TIMESTAMP(3),
    "lessor_signed_at" TIMESTAMP(3),
    "lessor_signed_by" TEXT,
    "customer_signed_at" TIMESTAMP(3),
    "customer_signed_by" TEXT,
    "reject_reason" TEXT,
    "external_ref" TEXT,
    "pdf_doc_file_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_offs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."call_off_lines" (
    "id" TEXT NOT NULL,
    "call_off_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "wanted_from" TIMESTAMP(3),
    "wanted_to" TIMESTAMP(3),
    "project_id" TEXT,
    "machine_number" TEXT,
    "price_text" TEXT,

    CONSTRAINT "call_off_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_doc_folders_customer_system_key" ON "public"."doc_folders"("customer_id", "system_key");

-- CreateIndex
CREATE INDEX "idx_doc_folders_customer_parent" ON "public"."doc_folders"("customer_id", "parent_id");

-- CreateIndex
CREATE INDEX "idx_doc_folders_project_id" ON "public"."doc_folders"("project_id");

-- CreateIndex
CREATE INDEX "idx_doc_files_folder_id" ON "public"."doc_files"("folder_id");

-- CreateIndex
CREATE INDEX "idx_call_offs_customer_status" ON "public"."call_offs"("customer_id", "status");

-- CreateIndex
CREATE INDEX "idx_call_offs_created_by_id" ON "public"."call_offs"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_call_off_lines_call_off_id" ON "public"."call_off_lines"("call_off_id");

-- CreateIndex
CREATE INDEX "idx_call_off_lines_project_id" ON "public"."call_off_lines"("project_id");

-- AddForeignKey
ALTER TABLE "public"."doc_folders" ADD CONSTRAINT "doc_folders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("customer_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."doc_folders" ADD CONSTRAINT "doc_folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."doc_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."doc_folders" ADD CONSTRAINT "doc_folders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."doc_folders" ADD CONSTRAINT "doc_folders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."doc_files" ADD CONSTRAINT "doc_files_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."doc_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."doc_files" ADD CONSTRAINT "doc_files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."call_offs" ADD CONSTRAINT "call_offs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("customer_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."call_offs" ADD CONSTRAINT "call_offs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."call_off_lines" ADD CONSTRAINT "call_off_lines_call_off_id_fkey" FOREIGN KEY ("call_off_id") REFERENCES "public"."call_offs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."call_off_lines" ADD CONSTRAINT "call_off_lines_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
