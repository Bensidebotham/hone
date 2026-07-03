-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "contact" TEXT,
ADD COLUMN     "followUpDate" TIMESTAMP(3),
ADD COLUMN     "nextStep" TEXT,
ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "applicationTablePrefs" JSONB;
