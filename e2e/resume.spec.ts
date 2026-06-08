import { test, expect } from "@playwright/test";

// NOTE: The authenticated upload→analysis flow (POST /api/resume/upload →
// Trigger.dev task → Gemini analysis → /resume/[id] detail rendering) is
// covered by the route unit test at src/app/api/resume/upload/route.test.ts.
// Live e2e verification is pending until TRIGGER_SECRET_KEY and
// GOOGLE_GENERATIVE_AI_API_KEY are provisioned in the test environment.

test("unauthenticated GET /resume redirects to the landing page", async ({
  page,
}) => {
  // Start with a clean state — no cookies, no session
  await page.context().clearCookies();

  // Navigate to /resume without a session.
  // requireUser() calls auth() → no session → redirect("/").
  await page.goto("/resume");

  await expect(page).toHaveURL("/");
});
