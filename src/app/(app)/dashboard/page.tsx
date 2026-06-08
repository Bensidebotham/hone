import { requireUser } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";

export default async function Dashboard() {
  const user = await requireUser();
  return (
    <div className="flex min-h-screen">
      <AppNav />
      <main className="flex-1 p-8">
        <h1 className="text-2xl font-semibold">
          Welcome, {user.name ?? "there"}
        </h1>
        <p className="text-muted-foreground">
          Your profile health and job pipeline live here.
        </p>
      </main>
    </div>
  );
}
