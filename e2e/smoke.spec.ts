import { expect, test } from "@playwright/test";

test("liveness remains public and returns the V2 envelope", async ({ request }) => {
  const response = await request.get("/api/health/live");
  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    data: { status: "ok" },
    meta: { requestId: expect.any(String) },
  });
  expect(response.headers()["cache-control"]).toContain("no-store");
});

test("an anonymous dashboard request is redirected to the secure bootstrap or login page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page).toHaveTitle("Outlook Mail Manager V2");
  await expect(page.getByText(/首次安全初始化|Outlook Mail Manager V2/)).toBeVisible();
});
