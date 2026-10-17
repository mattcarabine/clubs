import { expect, test } from "./support/test.ts";

test("home page renders the club name", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A Bloo Bloo" }),
  ).toBeVisible();
});
