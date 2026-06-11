import { LogOut } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { signOutAction } from "@/app/actions/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm font-semibold text-primary">Your account</p>
        <h1 className="text-3xl font-extrabold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account.</p>
      </div>

      <Card className="max-w-xl hover:shadow-sm transition-shadow">
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote avatar host isn't configured for next/image
                <img
                  src={user.image}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                  {(user.name ?? user.email ?? "?").charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="font-medium truncate">{user.name ?? "—"}</p>
                <p className="text-sm text-muted-foreground truncate">{user.email}</p>
              </div>
            </div>
            <form action={signOutAction}>
              <Button type="submit" variant="outline" size="sm">
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Sign out
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
