import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-6">
      <div className="text-center">
        <p className="text-sm font-semibold text-primary">404</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Page not found</h1>
        <p className="mx-auto mt-2 max-w-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </p>
        <Link href="/" className={buttonVariants({ className: "mt-6" })}>
          Back to home
        </Link>
      </div>
    </div>
  );
}
