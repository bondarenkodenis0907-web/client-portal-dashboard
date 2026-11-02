import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Database } from "../../src/lib/supabase/database.types";

// A directory test must never create accounts or data in a hosted project.
test.use({ trace: "off" });
async function fixture() {
  const api = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (api !== "http://127.0.0.1:56321")
    throw Error("Dedicated local API required");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient<Database>(
    api,
    process.env.TEST_SUPABASE_SECRET_KEY!,
    options,
  );
  const clients = [0, 1, 2, 3].map(() =>
    createClient<Database>(
      api,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      options,
    ),
  );
  const users: { id: string; email: string }[] = [];
  const siteIds: string[] = [];
  const password = randomUUID();
  const names = ["North Yard " + randomUUID(), "South Yard " + randomUUID()];
  const buildingIds = [randomUUID(), randomUUID()];
  async function cleanup() {
    if (siteIds.length) {
      for (const table of ["site_memberships", "buildings"] as const) {
        const result = await admin.from(table).delete().in("site_id", siteIds);
        if (result.error) throw Error("Directory fixture cleanup failed");
      }
      const result = await admin.from("sites").delete().in("id", siteIds);
      if (result.error) throw Error("Site fixture cleanup failed");
    }
    for (const user of users) {
      const result = await admin.auth.admin.deleteUser(user.id);
      if (result.error) throw Error("Directory account cleanup failed");
    }
  }
  try {
    for (let i = 0; i < clients.length; i++) {
      const email = `facility-${randomUUID()}@example.test`;
      const made = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (made.error || !made.data.user)
        throw Error("Directory fixture account failed");
      users.push({ id: made.data.user.id, email });
      const signed = await clients[i].auth.signInWithPassword({
        email,
        password,
      });
      if (signed.error) throw Error("Directory fixture sign-in failed");
    }
    siteIds.push(randomUUID(), randomUUID());
    const seeded = await Promise.all([
      admin.from("sites").insert(
        siteIds.map((id, i) => ({
          id,
          name: names[i],
          address: `Synthetic address ${i}`,
        })),
      ),
      admin
        .from("service_staff")
        .insert({ user_id: users[2].id, display_name: "Directory engineer" }),
    ]);
    if (seeded.some((r) => r.error)) throw Error("Directory seed failed");
    const children = await Promise.all([
      admin.from("buildings").insert(
        siteIds.map((site_id, i) => ({
          id: buildingIds[i],
          site_id,
          name: `Building ${i + 1}`,
          address: `Building address ${i}`,
        })),
      ),
      admin
        .from("site_memberships")
        .insert(
          siteIds.map((site_id, i) => ({ site_id, user_id: users[i].id })),
        ),
    ]);
    if (children.some((r) => r.error))
      throw Error("Building/admission seed failed");
  } catch (error) {
    await cleanup();
    throw error;
  }
  return {
    admin,
    clients,
    users,
    siteIds,
    names,
    buildingIds,
    cleanup,
    async signIn(page: Page, actor = 0) {
      await page.goto("/login");
      await page.getByLabel("Email address").fill(users[actor].email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
      await page.goto("/dashboard/sites");
    },
  };
}

test("client directory, direct API isolation, nested-ID tampering and revocation with old session", async ({
  page,
}) => {
  const f = await fixture();
  try {
    await f.signIn(page);
    await expect(
      page.getByRole("heading", { name: "Sites", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: new RegExp(f.names[0]) }),
    ).toBeVisible();
    await expect(page.getByText(f.names[1], { exact: true })).toHaveCount(0);
    const hidden = await f.clients[0]
      .from("buildings")
      .select("id")
      .eq("id", f.buildingIds[1]);
    expect(hidden.error).toBeNull();
    expect(hidden.data).toEqual([]);
    const injected = await f.clients[0]
      .from("site_memberships")
      .insert({ site_id: f.siteIds[1], user_id: f.users[0].id });
    expect(injected.error?.code).toBe("42501");
    await page.getByRole("link", { name: new RegExp(f.names[0]) }).click();
    await page.getByRole("link", { name: /Building 1/ }).click();
    await expect(
      page.getByRole("heading", { name: "Building 1", exact: true }),
    ).toBeVisible();
    await page.goto(
      `/dashboard/sites/${f.siteIds[0]}/buildings/${f.buildingIds[1]}`,
    );
    await expect(
      page.getByRole("heading", { name: "Site or building unavailable" }),
    ).toBeVisible();
    await expect(page.getByText(f.names[1], { exact: true })).toHaveCount(0);
    const revoked = await f.admin
      .from("site_memberships")
      .update({ is_active: false })
      .eq("user_id", f.users[0].id);
    expect(revoked.error).toBeNull();
    // Existing authenticated API client and browser, no refresh/new sign-in.
    expect((await f.clients[0].from("sites").select("id")).data).toEqual([]);
    await page.goto(`/dashboard/sites/${f.siteIds[0]}`);
    await expect(
      page.getByRole("heading", { name: "Site or building unavailable" }),
    ).toBeVisible();
    await page.goto("/dashboard/sites");
    await expect(
      page.getByRole("heading", { name: "No sites available" }),
    ).toBeVisible();
  } finally {
    await f.cleanup();
  }
});

test("active staff directory and deactivated staff cannot bypass admission", async ({
  page,
}) => {
  const f = await fixture();
  try {
    await f.signIn(page, 2);
    for (const name of f.names)
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    // Even staff who can read both parents cannot combine unrelated IDs.
    await page.goto(
      `/dashboard/sites/${f.siteIds[0]}/buildings/${f.buildingIds[1]}`,
    );
    await expect(
      page.getByRole("heading", { name: "Site or building unavailable" }),
    ).toBeVisible();
    expect(
      (
        await f.admin
          .from("service_staff")
          .update({ is_active: false })
          .eq("user_id", f.users[2].id)
      ).error,
    ).toBeNull();
    expect((await f.clients[2].from("sites").select("id")).data).toEqual([]);
    await page.goto("/dashboard/sites");
    await expect(
      page.getByRole("heading", { name: "No sites available" }),
    ).toBeVisible();
    await page.goto("/dashboard/sites/not-a-uuid");
    await expect(
      page.getByRole("heading", { name: "Site or building unavailable" }),
    ).toBeVisible();
  } finally {
    await f.cleanup();
  }
});

test("server pagination, stable equal-name order, mobile navigation and empty admission", async ({
  page,
}) => {
  const f = await fixture();
  try {
    const extra = Array.from({ length: 50 }, () => ({
      id: randomUUID(),
      name: f.names[0],
    }));
    f.siteIds.push(...extra.map((s) => s.id));
    expect((await f.admin.from("sites").insert(extra)).error).toBeNull();
    expect(
      (
        await f.admin
          .from("site_memberships")
          .insert(extra.map((s) => ({ site_id: s.id, user_id: f.users[0].id })))
      ).error,
    ).toBeNull();
    const expectedIds = [f.siteIds[0], ...extra.map((s) => s.id)].sort();
    await page.setViewportSize({ width: 390, height: 844 });
    await f.signIn(page);
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Sites", exact: true })
      .click();
    const cards = page.locator('main a[href^="/dashboard/sites/"]');
    await expect(cards).toHaveCount(50);
    const first = await cards.evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute("href")?.split("/").at(-1)),
    );
    expect(first).toEqual(expectedIds.slice(0, 50));
    await page.getByRole("link", { name: "Next page" }).click();
    await expect(cards).toHaveCount(1);
    await expect(cards).toHaveAttribute(
      "href",
      `/dashboard/sites/${expectedIds[50]}`,
    );
    await expect(
      page.getByRole("navigation", { name: "Directory pages" }),
    ).toContainText("51 total");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const extraBuildings = Array.from({ length: 50 }, () => ({
      id: randomUUID(),
      site_id: f.siteIds[0],
      name: "Building 1",
    }));
    expect(
      (await f.admin.from("buildings").insert(extraBuildings)).error,
    ).toBeNull();
    await page.goto(`/dashboard/sites/${f.siteIds[0]}`);
    const buildingCards = page.locator('main a[href*="/buildings/"]');
    await expect(buildingCards).toHaveCount(50);
    await page.getByRole("link", { name: "Next page" }).click();
    await expect(buildingCards).toHaveCount(1);
    const expectedBuilding = [
      f.buildingIds[0],
      ...extraBuildings.map((b) => b.id),
    ].sort()[50];
    await expect(buildingCards).toHaveAttribute(
      "href",
      `/dashboard/sites/${f.siteIds[0]}/buildings/${expectedBuilding}`,
    );
    // Invalid/repeated query values safely start at the first page.
    await page.goto("/dashboard/sites?page=-1&page=999999");
    await expect(cards).toHaveCount(50);
    await page.context().clearCookies();
    await f.signIn(page, 3);
    await expect(
      page.getByRole("heading", { name: "No sites available" }),
    ).toBeVisible();
    await expect(page.getByText(f.names[0], { exact: true })).toHaveCount(0);
  } finally {
    await f.cleanup();
  }
});
