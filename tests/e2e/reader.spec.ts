import { test, expect, type Page } from "@playwright/test";

const novelPath = "/novels/a-regressors-tale-of-cultivation";
async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Continue with email" }).click();
  await expect(page).toHaveURL(/\/bookmarks$/);
}
async function signOut(page: Page) {
  await page.goto("/logout");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("guest protection, normalized identity, bookmarks, isolation and removal", async ({ page }) => {
  const email = `reader-${Date.now()}@example.com`;
  await page.goto("/bookmarks");
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await expect(page.getByText("Prototype sign-in. Email is not verified.", { exact: true })).toBeVisible();
  await page.getByLabel("Email address", { exact: true }).fill(email.toUpperCase());
  await page.getByRole("button", { name: "Continue with email" }).click();
  await expect(page.getByRole("heading", { name: "A shelf waiting for a story" })).toBeVisible();
  await page.goto(novelPath);
  await page.getByRole("button", { name: "Bookmark this novel", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove bookmark for this novel" })).toHaveAttribute("aria-pressed", "true");
  await page.locator(".chapter-list a").first().click();
  await page.locator("#reader-dock").getByRole("button", { name: "Bookmark this chapter", exact: true }).click();
  await expect(page.locator("#reader-dock").getByRole("button", { name: "Remove bookmark for this chapter" })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/bookmarks");
  await expect(page.locator(".bookmark-row")).toHaveCount(2);
  await signOut(page);
  await signIn(page, `other-${Date.now()}@example.com`);
  await expect(page.getByRole("heading", { name: "A shelf waiting for a story" })).toBeVisible();
  await signOut(page);
  await signIn(page, email);
  await expect(page.locator(".bookmark-row")).toHaveCount(2);
  await page.getByLabel("Bookmark type", { exact: true }).selectOption("chapter");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".bookmark-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Remove bookmark for this chapter" }).click();
  await expect(page.getByRole("heading", { name: "No matching bookmarks" })).toBeVisible();
});

test("chapter dock hides, returns, preserves navigation, and respects reduced motion", async ({ page }) => {
  await page.goto(novelPath);
  const first = await page.locator(".chapter-list a").first().getAttribute("href");
  await page.locator(".chapter-list a").first().click();
  const dock = page.locator("#reader-dock");
  await expect(dock.getByRole("button", { name: "No previous chapter" })).toBeDisabled();
  await expect(page.locator(".reader-article .markdown p").first()).not.toBeEmpty();
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo({ top: 700, behavior: "instant" }); });
  await expect(dock).toHaveAttribute("aria-hidden", "true");
  await expect(dock).toHaveAttribute("inert", "");
  await page.evaluate(() => window.scrollTo({ top: 580, behavior: "instant" }));
  await expect(dock).toHaveAttribute("aria-hidden", "false");
  await page.getByRole("button", { name: "Hide controls", exact: true }).click();
  await page.getByRole("button", { name: "Chapter controls", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(dock).toHaveAttribute("aria-hidden", "false");
  await dock.getByRole("link", { name: "Next", exact: true }).click();
  await expect(dock.getByRole("link", { name: "Previous", exact: true })).toHaveAttribute("href", first!);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(dock).toHaveCSS("transition-duration", "0s");
});

test("atlas is gated, sourced, searchable, and has graph/list/timeline alternatives", async ({ page }) => {
  await page.goto(`${novelPath}/atlas`);
  await expect(page.locator(".atlas-canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "Reveal atlas with spoilers" }).click();
  await expect(page.locator(".atlas-canvas")).toBeVisible();
  await expect.poll(() => page.locator(".atlas-node").count()).toBeLessThanOrEqual(17);
  await expect(page.locator(".atlas-sources a").first()).toHaveAttribute("href", /#ref-\d+$/);
  const initial = await page.locator(".atlas-world").getAttribute("style");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.locator(".atlas-world")).not.toHaveAttribute("style", initial!);
  await page.getByRole("button", { name: "Fit graph" }).click();
  await page.getByLabel("Search atlas", { exact: true }).fill("zzzz-not-a-real-character");
  await expect(page.getByRole("heading", { name: "No matching entries" })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.locator(".atlas-entry")).toHaveCount(30);
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(page.locator(".atlas-timeline-note")).toBeVisible();
  await page.getByRole("button", { name: "Graph", exact: true }).click();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.locator(".atlas-node").count()).toBeLessThanOrEqual(5);
});
