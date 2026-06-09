-- CreateTable
CREATE TABLE "ResumeGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "suggestionText" TEXT NOT NULL,
    "priority" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResumeGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResumeGoal_resumeId_suggestionText_key" ON "ResumeGoal"("resumeId", "suggestionText");

-- AddForeignKey
ALTER TABLE "ResumeGoal" ADD CONSTRAINT "ResumeGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeGoal" ADD CONSTRAINT "ResumeGoal_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE CASCADE ON UPDATE CASCADE;
