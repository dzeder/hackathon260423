import { test, expect } from "@playwright/test";

/**
 * §15 demo happy path.
 * Toggle Iron Bowl → see KPIs update → ask copilot → response renders.
 */
test.describe("demo happy path", () => {
  test("dashboard renders Yellowhammer heading and chart", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("dashboard-heading")).toContainText("Yellowhammer");
    await expect(page.getByTestId("revenue-chart")).toBeVisible();
  });

  test("applying Iron Bowl event updates the EBITDA KPI", async ({ page }) => {
    await page.goto("/");
    const before = await page.getByTestId("kpi-ebitda-delta").textContent();
    expect(before).toBe("0.0%");

    await page.getByTestId("event-iron-bowl-2026").click();
    await expect(page.getByTestId("kpi-ebitda-delta")).not.toHaveText("0.0%");
    await expect(page.getByTestId("kpi-event-count")).toHaveText("1");
  });

  test("copilot responds to Iron Bowl question with citations", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("copilot-prompt").fill("Walk me through the Iron Bowl impact");
    await page.getByTestId("copilot-submit").click();

    const response = page.getByTestId("copilot-response");
    await expect(response).toBeVisible();
    await expect(response).toContainText(/CFBD/i);
  });

  test("reset button clears applied events", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("event-iron-bowl-2026").click();
    await expect(page.getByTestId("kpi-event-count")).toHaveText("1");

    await page.getByTestId("reset-events").click();
    await expect(page.getByTestId("kpi-event-count")).toHaveText("0");
  });
});
