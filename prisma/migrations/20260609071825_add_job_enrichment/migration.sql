-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "country" TEXT,
ADD COLUMN     "isRemote" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "level" TEXT,
ADD COLUMN     "roleCategory" TEXT,
ADD COLUMN     "salaryMax" INTEGER,
ADD COLUMN     "salaryMin" INTEGER,
ADD COLUMN     "techTags" TEXT[];

-- CreateIndex
CREATE INDEX "Job_country_idx" ON "Job"("country");

-- CreateIndex
CREATE INDEX "Job_isRemote_idx" ON "Job"("isRemote");

-- CreateIndex
CREATE INDEX "Job_roleCategory_idx" ON "Job"("roleCategory");

-- CreateIndex
CREATE INDEX "Job_level_idx" ON "Job"("level");

-- CreateIndex
CREATE INDEX "Job_salaryMin_idx" ON "Job"("salaryMin");

-- CreateIndex
CREATE INDEX "Job_techTags_idx" ON "Job" USING GIN ("techTags");
