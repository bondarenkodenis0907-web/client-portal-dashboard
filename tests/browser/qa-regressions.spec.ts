import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Database } from "../../src/lib/supabase/database.types";
import { getRequestPage } from "../../src/lib/request-pages";

test.use({ trace: "off" });
async function fixture(count = 1) {
  const api = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (api !== "http://127.0.0.1:56321")
    throw Error("Dedicated local QA backend required");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient<Database>(
    api,
    process.env.TEST_SUPABASE_SECRET_KEY!,
    options,
  );
  const users: { id: string; email: string; password: string }[] = [];
  const client = createClient<Database>(
    api,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    options,
  );
  try {
    for (let i = 0; i < count; i++) {
      const email = `qa-regression-${randomUUID()}@example.test`,
        password = randomUUID();
      const r = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (r.error || !r.data.user) throw Error("Local fixture creation failed");
      users.push({ id: r.data.user.id, email, password });
    }
  } catch (error) {
    for (const user of users) await admin.auth.admin.deleteUser(user.id);
    throw error;
  }
  return {
    admin,
    client,
    users,
    async signIn(page: Page, index = 0) {
      await page.goto("/login");
      await page.getByLabel("Email address").fill(users[index].email);
      await page
        .getByLabel("Password", { exact: true })
        .fill(users[index].password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
    },
    async cleanup() {
      for (const user of users)
        expect((await admin.auth.admin.deleteUser(user.id)).error).toBeNull();
    },
  };
}

for (const timezoneId of ["UTC", "Europe/Moscow", "America/New_York"]) {
  test(`request detail hydrates without date errors in ${timezoneId}`, async ({
    browser,
  }) => {
    const f = await fixture();
    const context = await browser.newContext({ timezoneId });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      const r = await f.admin
        .from("service_requests")
        .insert({
          user_id: f.users[0].id,
          operation_key: randomUUID(),
          site: "Time zone regression",
          system: "CCTV",
          description: "Clock consistency",
          created_at: "2026-10-30T00:15:00Z",
        })
        .select("id")
        .single();
      expect(r.error).toBeNull();
      await f.signIn(page);
      const url = `/dashboard/requests/${r.data!.id}`;
      const ssr = await page.request.get(url);
      expect(await ssr.text()).toContain("12:15 AM UTC");
      await page.goto(url);
      await expect(
        page.getByRole("heading", { name: "Time zone regression" }),
      ).toBeVisible();
      await expect(page.locator("main")).toContainText("12:15 AM UTC");
      await expect(
        page.getByRole("link", { name: /My requests/ }),
      ).toBeVisible();
      expect(errors).toEqual([]);
    } finally {
      await context.close();
      await f.cleanup();
    }
  });
}

test("mobile navigation excludes hidden links, traps focus, closes and restores focus", async ({
  browser,
}) => {
  const f = await fixture();
  const context = await browser.newContext({
    viewport: { width: 360, height: 900 },
  });
  const page = await context.newPage();
  try {
    await f.signIn(page);
    await page.reload();
    const open = page.getByRole("button", {
      name: "Open navigation",
      exact: true,
    });
    await expect(
      page.getByRole("link", { name: "New request", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(open).toBeFocused();
    await expect(open).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Enter");
    const panel = page.getByRole("dialog", { name: "Navigation", exact: true });
    await expect(panel).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Close menu", exact: true }),
    ).toBeFocused();
    for (const key of ["Tab", "Shift+Tab"])
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press(key);
        expect(
          await page.evaluate(() => !!document.activeElement?.closest("aside")),
        ).toBe(true);
      }
    await page.keyboard.press("Escape");
    await expect(open).toBeFocused();
    await expect(open).toHaveAttribute("aria-expanded", "false");
    await open.click();
    await panel
      .getByRole("link", { name: "Service requests", exact: true })
      .click();
    await expect(page).toHaveURL(/\/dashboard\/requests$/);
    await expect(open).toHaveAttribute("aria-expanded", "false");
    await open.click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect
      .poll(() => page.locator("body").evaluate((el) => el.style.overflow))
      .toBe("");
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }),
    ).toBeVisible();
  } finally {
    await context.close();
    await f.cleanup();
  }
});

for (const path of ["requests", "settings"]) {
  test(`temporary Auth outage keeps ${path} open and retry restores it`, async ({
    page,
  }) => {
    const f = await fixture();
    try {
      await f.signIn(page);
      await page.route("**/auth/v1/user", (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "Synthetic Auth outage" }),
        }),
      );
      await page.goto(`/dashboard/${path}`);
      await expect(page.locator("main").getByRole("alert")).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/dashboard/${path}$`));
      await page.unroute("**/auth/v1/user");
      await page
        .getByRole("button", { name: "Try again", exact: true })
        .click();
      if (path === "settings")
        await expect(
          page.getByLabel("Full name", { exact: true }),
        ).toBeVisible();
      else
        await expect(
          page.getByRole("button", { name: "Create request", exact: true }),
        ).toBeEnabled();
      await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
    } finally {
      await f.cleanup();
    }
  });
}

test("server pages/search reach the 1001st request and retain RLS, literal filters and stable ties", async ({
  browser,
}) => {
  test.setTimeout(90000);
  const f = await fixture(3);
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    const oldest = await f.admin
      .from("service_requests")
      .insert({
        user_id: f.users[0].id,
        operation_key: randomUUID(),
        site: 'QA oldest 50%_ "(zone),x',
        system: "CCTV",
        description: "Old request",
        created_at: "2020-01-01T00:00:00Z",
      })
      .select("id")
      .single();
    expect(oldest.error).toBeNull();
    for (let batch = 0; batch < 2; batch++)
      expect(
        (
          await f.admin.from("service_requests").insert(
            Array.from({ length: 500 }, (_, i) => ({
              user_id: f.users[0].id,
              operation_key: randomUUID(),
              site: `QA volume ${batch * 500 + i}`,
              system: "CCTV",
              description: "Paged request",
              created_at: "2026-10-30T00:00:00Z",
            })),
          )
        ).error,
      ).toBeNull();
    expect(
      (
        await f.admin.from("service_requests").insert({
          user_id: f.users[1].id,
          operation_key: randomUUID(),
          site: "Other private client",
          system: "CCTV",
          description: "Not visible to first client",
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await f.admin.from("service_staff").insert({
          user_id: f.users[2].id,
          display_name: "QA pagination engineer",
        })
      ).error,
    ).toBeNull();
    expect(
      (await f.client.auth.signInWithPassword(f.users[0])).error,
    ).toBeNull();
    const get = (page: number, search = "", userId = f.users[0].id) =>
      getRequestPage(f.client, { page, search, status: "all", userId });
    const first = await get(0),
      second = await get(1),
      last = await get(20);
    expect(first.total).toBe(1001);
    expect(first.requests).toHaveLength(50);
    expect(second.requests).toHaveLength(50);
    expect(
      new Set([...first.requests, ...second.requests].map((r) => r.id)).size,
    ).toBe(100);
    expect(first.requests.map((r) => r.id)).toEqual(
      first.requests
        .map((r) => r.id)
        .sort()
        .reverse(),
    );
    expect(last.requests.map((r) => r.id)).toEqual([oldest.data!.id]);
    for (const literal of ["*", "[.*]", "\\"])
      expect((await get(0, literal)).total).toBe(0);
    expect((await get(0, "(zone)")).total).toBe(1);
    expect((await get(0, '50%_ "(zone),x')).requests.map((r) => r.id)).toEqual([
      oldest.data!.id,
    ]);
    expect((await get(0, '"),id.not.is.null')).total).toBe(0);
    expect((await get(0, "", f.users[1].id)).total).toBe(0);
    await f.signIn(page);
    await page.goto("/dashboard/requests");
    await expect(page.getByText("1001 total", { exact: true })).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(50);
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await expect(page.getByText("Page 2 of 21", { exact: true })).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(50);
    await page
      .getByRole("searchbox", { name: "Search requests", exact: true })
      .fill("QA oldest");
    await expect(
      page.getByRole("link", { name: 'QA oldest 50%_ "(zone),x', exact: true }),
    ).toBeVisible();
    await expect(page.getByText("1 total", { exact: true })).toBeVisible();
    await expect(page.getByText("Page 1 of 1", { exact: true })).toBeVisible();
    await context.clearCookies();
    await f.signIn(page, 2);
    await page.goto("/dashboard/staff");
    await expect(
      page.getByText("50 shown · 1002 total", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("searchbox", { name: "Search requests", exact: true })
      .fill("QA oldest");
    await expect(
      page.getByRole("link", { name: 'QA oldest 50%_ "(zone),x', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("1 shown · 1 total", { exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
    await f.cleanup();
  }
});

test("superseded search replies cannot replace the latest request list", async ({
  page,
}) => {
  const f = await fixture();
  let release!: () => void;
  const hold = new Promise<void>((resolve) => (release = resolve));
  let sawOld!: () => void;
  const oldStarted = new Promise<void>((resolve) => (sawOld = resolve));
  try {
    for (const site of ["QA search first", "QA search second"])
      expect(
        (
          await f.admin.from("service_requests").insert({
            user_id: f.users[0].id,
            operation_key: randomUUID(),
            site,
            system: "CCTV",
            description: "Search race",
          })
        ).error,
      ).toBeNull();
    await f.signIn(page);
    await page.goto("/dashboard/requests");
    await expect(page.getByText("2 total", { exact: true })).toBeVisible();
    await page.route("**/rest/v1/service_requests?*", async (route) => {
      if (
        new URL(route.request().url()).searchParams
          .get("or")
          ?.includes("QA search first")
      ) {
        const response = await route.fetch();
        sawOld();
        await hold;
        try {
          await route.fulfill({ response });
        } catch {}
      } else await route.continue();
    });
    const search = page.getByRole("searchbox", {
      name: "Search requests",
      exact: true,
    });
    await search.fill("QA search first");
    await oldStarted;
    await search.fill("QA search second");
    await expect(
      page.getByRole("link", { name: "QA search second", exact: true }),
    ).toBeVisible();
    release();
    await expect(
      page.getByRole("link", { name: "QA search first", exact: true }),
    ).toHaveCount(0);
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
    await f.cleanup();
  }
});
