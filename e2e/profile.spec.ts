import { test, expect } from "@playwright/test";

test("unauthenticated GET /profile redirects to the landing page", async ({
  page,
}) => {
  // Start with a clean state — no cookies, no session
  await page.context().clearCookies();

  // Navigate to /profile without a session.
  // requireUser() calls auth() → no session → redirect("/").
  await page.goto("/profile");

  await expect(page).toHaveURL("/");
});
