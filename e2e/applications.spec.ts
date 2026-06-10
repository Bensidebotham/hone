import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";

test("unauthenticated GET /applications redirects to the landing page", async ({
  page,
}) => {
  // Start with a clean state — no cookies, no session
  await page.context().clearCookies();

  // Navigate to /applications without a session.
  // requireUser() calls auth() → no session → redirect("/").
  // Verified runtime behavior: 307 to "/" (the landing page).
  await page.goto("/applications");

  await expect(page).toHaveURL("/");
});

// Authenticated flow — only runs when a Playwright storage state is present.
const STORAGE = "e2e/.auth/state.json";
const authed = existsSync(STORAGE);

test.describe("applications power table (authenticated)", () => {
  test.skip(!authed, "no seeded auth state; skipping authenticated flow");
  test.use({ storageState: STORAGE });

  test("add a job manually, then delete it", async ({ page }) => {
    await page.goto("/applications");

    // Add
    await page.getByRole("button", { name: /add job/i }).first().click();
    await page.getByLabel(/company/i).fill("Playwright Co");
    await page.getByLabel(/role/i).fill("E2E Engineer");
    await page.getByRole("button", { name: /^add job$/i }).click();
    await expect(page.getByText("Playwright Co")).toBeVisible();

    // Open detail + delete
    await page.getByText("Playwright Co").click();
    await page.getByRole("button", { name: /delete/i }).click();
    await expect(page.getByText("Playwright Co")).toHaveCount(0);
  });
});
