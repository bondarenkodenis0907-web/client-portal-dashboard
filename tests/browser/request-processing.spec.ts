import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Database } from "../../src/lib/supabase/database.types";

test("client submits an issue, staff complete it, client sees the resolution", async ({
  browser,
}) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname))
    throw new Error("Use an isolated local backend.");
  const admin = createClient<Database>(
    url,
    process.env.TEST_SUPABASE_SECRET_KEY!,
    {
      auth: { persistSession: false },
    },
  );
  const suffix = randomUUID();
  const password = randomUUID();
  const clientEmail = `client-${suffix}@example.test`;
  const staffEmail = `engineer-${suffix}@example.test`;
  const ids: string[] = [];
  const clientContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const staffContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const clientPage = await clientContext.newPage();
  const staffPage = await staffContext.newPage();
  const browserErrors: string[] = [];
  for (const page of [clientPage, staffPage])
    page.on("pageerror", (error) => browserErrors.push(error.message));
  async function signIn(page: Page, email: string) {
    await page.goto("/login");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  }
  async function screenshot(page: Page, filename: string) {
    await page.evaluate(() => document.fonts.ready);
    if (process.env.CAPTURE_PORTFOLIO === "1")
      await page.screenshot({
        path: `public/screenshots/${filename}`,
        fullPage: true,
        animations: "disabled",
      });
  }
  try {
    for (const email of [clientEmail, staffEmail]) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user)
        throw error ?? new Error("Test account creation failed");
      ids.push(data.user.id);
    }
    const { error: membershipError } = await admin
      .from("service_staff")
      .insert({
        user_id: ids[1],
        display_name: "Alex Morgan · Service engineer",
      });
    if (membershipError) throw membershipError;
    await admin
      .from("profiles")
      .update({
        full_name: "Sam Taylor",
        company: "Demo Facilities",
        job_title: "Site coordinator",
      })
      .eq("id", ids[0]);
    await signIn(clientPage, clientEmail);
    await expect(
      clientPage.getByRole("link", { name: "Service queue", exact: true }),
    ).toHaveCount(0);
    await clientPage.goto("/dashboard/staff");
    await expect(clientPage).toHaveURL(/\/dashboard$/);
    await clientPage.goto("/dashboard/requests");
    await clientPage
      .getByLabel("Site", { exact: false })
      .first()
      .fill("Demo · Riverside Office");
    await clientPage.getByLabel("Technical system").fill("CCTV");
    await clientPage
      .getByLabel("Issue description")
      .fill(
        "The loading-bay camera is offline. The remaining cameras are working.",
      );
    await clientPage
      .getByLabel("Site", { exact: false })
      .first()
      .fill(" \u00a0 ");
    await clientPage
      .getByRole("button", { name: "Create request", exact: true })
      .click();
    await expect(
      clientPage
        .getByRole("alert")
        .filter({ hasText: "Please complete all required fields" }),
    ).toBeVisible();
    await expect(clientPage.getByLabel("Issue description")).toHaveValue(
      "The loading-bay camera is offline. The remaining cameras are working.",
    );
    await clientPage
      .getByLabel("Site", { exact: false })
      .first()
      .fill("Demo · Riverside Office");
    await clientPage
      .getByLabel("Priority", { exact: true })
      .selectOption("high");
    await clientPage
      .getByRole("button", { name: "Create request", exact: true })
      .click();
    await expect(clientPage.getByRole("status")).toContainText(
      "Service request created",
    );
    await clientPage
      .getByRole("link", { name: "Demo · Riverside Office", exact: true })
      .click();
    await expect(
      clientPage.getByRole("heading", { name: "What happens next" }),
    ).toBeVisible();
    const requestUrl = clientPage.url();

    await signIn(staffPage, staffEmail);
    await staffPage
      .getByRole("link", { name: "Service queue", exact: true })
      .click();
    await expect(
      staffPage.getByRole("link", {
        name: "Demo · Riverside Office",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      staffPage.getByRole("link", { name: "Service queue", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(staffPage.getByTitle(staffEmail)).toHaveText(staffEmail);
    await screenshot(staffPage, "staff-queue.png");
    await staffPage
      .getByRole("link", { name: "Demo · Riverside Office", exact: true })
      .click();
    await staffPage.getByLabel("Assigned engineer").selectOption(ids[1]);
    await staffPage
      .getByRole("button", { name: "Assign and start work" })
      .click();
    await expect(
      staffPage.getByRole("button", { name: "Close request" }),
    ).toBeVisible();
    await screenshot(staffPage, "request-in-progress.png");
    await staffPage
      .getByLabel("Completed work")
      .fill("\u00a0 123456789 \u00a0");
    await staffPage
      .getByRole("button", { name: "Close request", exact: true })
      .click();
    await expect(
      staffPage
        .getByRole("alert")
        .filter({ hasText: "at least 10 characters" }),
    ).toBeVisible();
    await expect(
      staffPage.getByRole("button", { name: "Close request", exact: true }),
    ).toBeVisible();
    const stalePage = await staffContext.newPage();
    await stalePage.goto(requestUrl);
    await expect(
      stalePage.getByRole("button", { name: "Close request" }),
    ).toBeVisible();
    await staffPage
      .getByLabel("Completed work")
      .fill(
        "Replaced the damaged PoE connector, restored the video feed and checked recording playback.",
      );
    await staffPage.route("**/rest/v1/service_requests*", async (route) => {
      if (route.request().method() === "PATCH") await route.abort();
      else await route.continue();
    });
    await staffPage
      .getByRole("button", { name: "Close request", exact: true })
      .click();
    await expect(
      staffPage
        .getByRole("alert")
        .filter({ hasText: "Saving could not be confirmed" }),
    ).toBeVisible();
    await expect(staffPage.getByLabel("Completed work")).toHaveValue(
      "Replaced the damaged PoE connector, restored the video feed and checked recording playback.",
    );
    await staffPage.unroute("**/rest/v1/service_requests*");
    await staffPage.getByRole("button", { name: "Reload request" }).click();
    await staffPage
      .getByRole("button", { name: "Close request", exact: true })
      .click();
    await expect(
      staffPage.getByRole("heading", { name: "Work completed" }),
    ).toBeVisible();
    await expect(
      staffPage.getByRole("button", { name: "Close request" }),
    ).toHaveCount(0);
    await stalePage.getByRole("button", { name: "Save assignment" }).click();
    await expect(
      stalePage.getByRole("alert").filter({ hasText: "This request changed" }),
    ).toBeVisible();

    await clientPage.goto(requestUrl);
    await expect(
      clientPage.getByRole("heading", { name: "Work completed" }),
    ).toBeVisible();
    await expect(clientPage.getByRole("listitem")).toHaveCount(3);
    await expect(clientPage.getByTitle(clientEmail)).toHaveText(clientEmail);
    await screenshot(clientPage, "request-completed.png");
    await clientPage.setViewportSize({ width: 390, height: 844 });
    await expect(
      clientPage.getByRole("link", { name: "Settings", exact: true }),
    ).not.toBeInViewport();
    expect(
      await clientPage
        .getByRole("heading", { level: 1 })
        .evaluate(
          (el) => el.getBoundingClientRect().right <= window.innerWidth,
        ),
    ).toBe(true);
    await screenshot(clientPage, "request-mobile.png");
    expect(
      await clientPage.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await clientPage.setViewportSize({ width: 1440, height: 1000 });
    const { data: saved, error: savedError } = await admin
      .from("service_requests")
      .select("status, assigned_to, resolution, closed_at")
      .eq("user_id", ids[0])
      .single();
    expect(savedError).toBeNull();
    expect(saved?.status).toBe("closed");
    expect(saved?.assigned_to).toBe(ids[1]);
    expect(saved?.closed_at).toBeTruthy();
    expect(browserErrors).toEqual([]);
  } finally {
    await Promise.all([clientContext.close(), staffContext.close()]);
    // Only accounts created in this test are removed, always on the local backend.
    if (ids.length) {
      await admin.from("service_requests").delete().in("user_id", ids);
      await admin.from("service_staff").delete().in("user_id", ids);
      for (const id of ids) await admin.auth.admin.deleteUser(id);
    }
  }
});
