import { expect, test } from "@playwright/test";

test("the home page renders and the counter responds to clicks", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "web-skeleton", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("Clicked 0 times")).toBeVisible();

  await page.getByRole("button", { name: "Increment" }).click();

  await expect(page.getByText("Clicked 1 times")).toBeVisible();
});
