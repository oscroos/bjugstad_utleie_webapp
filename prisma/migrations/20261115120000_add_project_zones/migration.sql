-- CreateTable
CREATE TABLE "public"."project_zones" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "geometry" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_zones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_project_zones_project_id" ON "public"."project_zones"("project_id");

-- AddForeignKey
ALTER TABLE "public"."project_zones" ADD CONSTRAINT "project_zones_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
