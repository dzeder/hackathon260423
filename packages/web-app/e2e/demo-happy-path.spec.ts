import { test, expect } from "@playwright/test";

/**
 * §15 demo happy-path placeholder.
 * Track A fills this in end-to-end: type prompt → copilot reads baseline →
 * applies Iron Bowl event → three-statement view flickers to updated numbers.
 */
test.describe("demo happy path", () => {
  test("landing page renders Ohanafy Plan heading", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /ohanafy plan/i })).toBeVisible();
  });
});
