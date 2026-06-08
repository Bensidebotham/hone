import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppNav } from "@/components/app-nav";
import { PasteJobForm } from "@/components/paste-job-form";
import { Badge } from "@/components/ui/badge";
import { MatchButton } from "@/components/match-button";
import { SaveJobButton } from "@/components/save-job-button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const user = await requireUser();
  const jobs = await prisma.job.findMany({
    where: { OR: [{ source: "ats" }, { userId: user.id }] },
    orderBy: { postedAt: "desc" },
    take: 100,
  });

  return (
    <div className="flex min-h-screen">
      <AppNav />
      <main className="flex-1 p-8 max-w-3xl">
        <h1 className="text-2xl font-semibold mb-1">Jobs</h1>
        <p className="text-muted-foreground mb-6">
          Browse ATS-synced listings or paste a job description to track it
          manually.
        </p>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Paste a Job</CardTitle>
            <CardDescription>
              Copy a job posting you found and save it to your feed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PasteJobForm />
          </CardContent>
        </Card>

        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No jobs yet — paste one above or wait for the ATS sync to run.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {jobs.map((job) => (
              <Card key={job.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-0.5">
                      <CardTitle className="text-base">{job.title}</CardTitle>
                      <CardDescription>
                        {job.company}
                        {job.location ? ` · ${job.location}` : ""}
                      </CardDescription>
                    </div>
                    <Badge variant={job.source === "ats" ? "secondary" : "outline"}>
                      {job.source === "ats" ? "ATS" : "Pasted"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {job.url && (
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary underline-offset-4 hover:underline"
                    >
                      View posting
                    </a>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <MatchButton jobId={job.id} />
                    <SaveJobButton jobId={job.id} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
