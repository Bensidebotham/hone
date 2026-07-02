/*
  Warnings:

  - You are about to drop the column `jobId` on the `Application` table. All the data in the column will be lost.
  - You are about to drop the `Job` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Match` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserSavedJob` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `company` to the `Application` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `Application` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Application" DROP CONSTRAINT "Application_jobId_fkey";

-- DropForeignKey
ALTER TABLE "Job" DROP CONSTRAINT "Job_userId_fkey";

-- DropForeignKey
ALTER TABLE "Match" DROP CONSTRAINT "Match_jobId_fkey";

-- DropForeignKey
ALTER TABLE "Match" DROP CONSTRAINT "Match_resumeId_fkey";

-- DropForeignKey
ALTER TABLE "UserSavedJob" DROP CONSTRAINT "UserSavedJob_jobId_fkey";

-- DropForeignKey
ALTER TABLE "UserSavedJob" DROP CONSTRAINT "UserSavedJob_userId_fkey";

-- AlterTable
ALTER TABLE "Application" DROP COLUMN "jobId",
ADD COLUMN     "company" TEXT NOT NULL,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "salary" TEXT,
ADD COLUMN     "title" TEXT NOT NULL,
ADD COLUMN     "url" TEXT;

-- DropTable
DROP TABLE "Job";

-- DropTable
DROP TABLE "Match";

-- DropTable
DROP TABLE "UserSavedJob";

-- DropEnum
DROP TYPE "JobSource";
