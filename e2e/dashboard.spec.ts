import { test, expect } from "@playwright/test";

test("unauthenticated GET /dashboard does not land on dashboard", async ({
  page,
}) => {
  // Start with a clean state — no cookies, no session
  await page.context().clearCookies();

  // Navigate to /dashboard without a session
  await page.goto("/dashboard");

  // requireUser() calls auth() → no session → redirect("/")
  // In practice Auth.js v5 (beta.31 with database strategy) redirects to
  // /auth/signin (its built-in sign-in page) because auth() itself detects
  // the missing session before requireUser() can call redirect("/").
  // Either way, the user is NOT served the dashboard.
  await expect(page).not.toHaveURL("http://localhost:3000/dashboard");

  // The user ends up on a sign-in or landing page
  const url = page.url();
  const isSignInPage =
    url === "http://localhost:3000/" ||
    url.startsWith("http://localhost:3000/auth/signin");
  expect(isSignInPage, `Unexpected redirect URL: ${url}`).toBe(true);
});
