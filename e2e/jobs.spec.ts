import { test, expect } from "@playwright/test";

// NOTE: The authenticated paste flow (POST /api/jobs/paste → DB write → feed
// refresh) is covered by the route unit test at
// src/app/api/jobs/paste/route.test.ts. Live e2e verification requires a
// seeded session and is deferred until the test environment supports it.

test("unauthenticated GET /jobs redirects to the landing page", async ({
  page,
}) => {
  // Start with a clean state — no cookies, no session
  await page.context().clearCookies();

  // Navigate to /jobs without a session.
  // requireUser() calls auth() → no session → redirect("/").
  await page.goto("/jobs");

  await expect(page).toHaveURL("/");
});
