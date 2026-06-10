import { test, expect } from "@playwright/test";

// NOTE: The authenticated upload→analysis flow (POST /api/resume/upload →
// Trigger.dev task → Gemini analysis → /resume/[id] detail rendering) is
// covered by the route unit test at src/app/api/resume/upload/route.test.ts.
// Live e2e verification is pending until TRIGGER_SECRET_KEY and
// GOOGLE_GENERATIVE_AI_API_KEY are provisioned in the test environment.
//
// The resume list + upload now live under the Profile tab (/profile). The
// standalone resume detail route still exists at /resume/[id].

test("unauthenticated GET /resume/[id] redirects to the landing page", async ({
  page,
}) => {
  // Start with a clean state — no cookies, no session
  await page.context().clearCookies();

  // Navigate to a resume detail route without a session.
  // requireUser() calls auth() → no session → redirect("/").
  await page.goto("/resume/any-id");

  await expect(page).toHaveURL("/");
});
