import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ResumePanel } from "@/components/profile/resume-panel";
import { LinkedinPanel } from "@/components/profile/linkedin-panel";
import { SitePanel } from "@/components/profile/site-panel";

// Always render fresh so polling via Refresh reflects the latest DB state.
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser();

  const [resumes, linkedinAnalysis, siteAnalysis] = await Promise.all([
    prisma.resume.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { analyses: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    prisma.analysis.findFirst({
      where: { userId: user.id, type: "linkedin" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.analysis.findFirst({
      where: { userId: user.id, type: "site" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <p className="text-sm font-semibold text-primary">Profile</p>
        <h1 className="text-3xl font-extrabold tracking-tight">Profile</h1>
        <p className="text-muted-foreground mt-1">
          Sharpen everything recruiters see — your resume, LinkedIn, and personal site.
        </p>
      </div>

      <Tabs defaultValue="resume">
        <TabsList className="mb-6">
          <TabsTrigger value="resume">Resume</TabsTrigger>
          <TabsTrigger value="linkedin">LinkedIn</TabsTrigger>
          <TabsTrigger value="site">Personal Site</TabsTrigger>
        </TabsList>

        <TabsContent value="resume">
          <ResumePanel resumes={resumes} />
        </TabsContent>
        <TabsContent value="linkedin">
          <LinkedinPanel analysis={linkedinAnalysis} />
        </TabsContent>
        <TabsContent value="site">
          <SitePanel analysis={siteAnalysis} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
