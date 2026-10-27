import { expect, test } from "./support/test.ts";

test("an unknown address is a titled 404 with a way back to Matches", async ({
  page,
}) => {
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page).toHaveTitle("A Bloo Bloo — Page not found");
  await expect(
    page.getByRole("heading", { level: 1, name: "Page not found" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to Matches" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Matches" }),
  ).toBeVisible();
});

test("home page renders the Matches heading", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Matches", level: 1 }),
  ).toBeVisible();
});
