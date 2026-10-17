import { expect, test } from "./support/test.ts";

test("home page renders the Matchday heading", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Matchday", level: 1 }),
  ).toBeVisible();
});
