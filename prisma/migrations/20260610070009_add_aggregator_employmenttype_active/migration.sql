-- AlterEnum
ALTER TYPE "JobSource" ADD VALUE 'aggregator';

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "employmentType" TEXT;

-- CreateIndex
CREATE INDEX "Job_employmentType_idx" ON "Job"("employmentType");

-- CreateIndex
CREATE INDEX "Job_active_idx" ON "Job"("active");
