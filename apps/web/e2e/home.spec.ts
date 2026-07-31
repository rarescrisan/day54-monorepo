import { expect, test } from "@playwright/test";

test("the home page explains the repo and the counter still responds", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "web-skeleton", level: 1 }),
  ).toBeVisible();

  // Each explainer section is reachable by its accessible name.
  for (const name of [
    "What is in here",
    "How AI-assisted development is supported",
    "Guardrails that do not depend on anyone remembering",
    "Promotion, not deployment-by-vibes",
    "The server/client boundary, live",
  ]) {
    await expect(page.getByRole("heading", { name, level: 2 })).toBeVisible();
  }

  // The client island inside the server-rendered page still works.
  await expect(page.getByText("Clicked 0 times")).toBeVisible();
  await page.getByRole("button", { name: "Increment" }).click();
  await expect(page.getByText("Clicked 1 times")).toBeVisible();
});
