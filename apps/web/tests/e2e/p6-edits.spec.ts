import { test, expect } from "@playwright/test";

test.describe("Phase 6: Refinement Loop, Diffs, and Rollback", () => {
  test.setTimeout(120000); // Allow more time for Next.js to compile on first run

  test("refinement loop: edit, diff, accept, rollback", async ({ page }) => {
    // 1. Navigate to the mock trip page
    await page.goto("/trip/mock-trip-123", { timeout: 60000 });

    // Dump page content to console to debug why locator fails
    console.log(await page.content());

    // 2. We should see the initial version history with Version 1
    await expect(page.locator("text=Version 1")).toBeVisible();

    // 3. Type edit command "make day 5 lighter"
    await page.fill('[data-testid="chat-input"]', "make day 5 lighter");
    await page.click('[data-testid="update-plan-btn"]');

    // 4. Verify DiffBanner appears with the correct text
    const diffBanner = page.locator('[data-testid="diff-banner"]');
    await expect(diffBanner).toBeVisible();
    await expect(diffBanner.locator('[data-testid="diff-hunk"]')).toHaveText(
      "Removed: Afternoon Tour, Added: Free Time",
    );

    // 5. Verify Version History shows Version 2
    await expect(page.locator("text=Version 2 (Current)")).toBeVisible();

    // 6. Accept the changes (clears the diff banner)
    await page.click("text=Accept All");
    await expect(diffBanner).toBeHidden();

    // 7. Rollback to version 1
    // Click Restore button on the Version 1 row
    await page
      .locator(".p-3")
      .filter({ hasText: "Version 1" })
      .getByRole("button", { name: "Restore" })
      .click();

    // 8. Verify we are back on version 1
    await expect(page.locator(".p-3").filter({ hasText: "Version 1 (Current)" })).toBeVisible();
  });

  test("constraint addition: infer constraints from edit", async ({ page }) => {
    await page.goto("/trip/mock-trip-123", { timeout: 60000 });

    // Type constraint-adding edit
    await page.fill('[data-testid="chat-input"]', "My mother is joining, she can't do stairs");
    await page.click('[data-testid="update-plan-btn"]');

    // Verify DiffBanner shows hotel swap
    const diffBanner = page.locator('[data-testid="diff-banner"]');
    await expect(diffBanner).toBeVisible();
    await expect(diffBanner.locator('[data-testid="diff-hunk"]')).toHaveText(
      "Swapped accommodation: Haveli -> Ground Floor Hotel",
    );

    // Verify mobility constraint chip is visible
    await expect(page.locator('[data-testid="mobility-constraint"]')).toBeVisible();
  });
});
