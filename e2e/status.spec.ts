import { expect, test } from "@playwright/test";

test("sign up, create a monitor, and view its status page", async ({ page }) => {
  const email = `user-${Date.now()}@example.com`;

  await page.goto("/register");
  await page.getByLabel("Name").fill("Test User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL("/");

  await page.goto("/monitors");
  await page.getByLabel("Name").fill("Example");
  await page.getByLabel("URL").fill("https://example.com");
  await page.getByRole("button", { name: "Create monitor" }).click();

  await expect(page.getByText("Example", { exact: true })).toBeVisible();

  await page.goto("/status/example");
  await expect(page.getByRole("heading", { name: "Example" })).toBeVisible();
  await expect(page.getByText("No data")).toBeVisible();
});
