-- CreateTable
CREATE TABLE "Tailoring" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "applicationId" TEXT,
    "company" TEXT,
    "jobTitle" TEXT,
    "jobDescription" TEXT NOT NULL,
    "fitScore" INTEGER NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tailoring_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Tailoring" ADD CONSTRAINT "Tailoring_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tailoring" ADD CONSTRAINT "Tailoring_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tailoring" ADD CONSTRAINT "Tailoring_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;
