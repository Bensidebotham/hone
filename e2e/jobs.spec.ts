import { test, expect } from "@playwright/test";

// NOTE: The authenticated two-pane jobs page (search, facet filters, list
// selection) requires a seeded session and job rows in the database.
// Live e2e verification is deferred until the test environment supports
// authenticated sessions (storageState / global-setup) and has seeded US
// software roles. The search/filter/selection flow is described below and
// should be uncommented once that infrastructure is in place.
//
// import { test, expect } from "@playwright/test";
//
// test.describe("Jobs page (authenticated)", () => {
//   test("search, filter, select", async ({ page }) => {
//     await page.goto("/jobs");
//     await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible();
//
//     // Keyword search
//     await page.getByLabel("Search title or company").fill("engineer");
//     await page.getByRole("button", { name: "Search" }).click();
//     await expect(page).toHaveURL(/q=engineer/);
//
//     // Apply a role facet (the chip's aria-label is "roleCategory")
//     await page.getByLabel("roleCategory").selectOption("frontend");
//     await expect(page).toHaveURL(/roleCategory=frontend/);
//
//     // Clicking first list item puts selected= in the URL
//     const firstItem = page.locator("[data-job-id]").first();
//     const jobId = await firstItem.getAttribute("data-job-id");
//     await firstItem.click();
//     await expect(page).toHaveURL(new RegExp(`selected=${jobId}`));
//   });
// });

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
