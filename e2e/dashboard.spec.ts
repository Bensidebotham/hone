import { test, expect } from "@playwright/test";

test("unauthenticated GET /dashboard redirects to the landing page", async ({
  page,
}) => {
  // Start with a clean state — no cookies, no session
  await page.context().clearCookies();

  // Navigate to /dashboard without a session.
  // requireUser() calls auth() → no session → redirect("/").
  // Verified runtime behavior: 307 to "/" (the landing page).
  await page.goto("/dashboard");

  await expect(page).toHaveURL("/");
});
