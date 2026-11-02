import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Database } from "../../src/lib/supabase/database.types";
test.use({ trace: "off" });
async function fixture() {
  const api = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (api !== "http://127.0.0.1:56321")
    throw Error("Dedicated local API required");
  const project =
    "client-portal-tests-" +
    createHash("sha256").update(process.cwd()).digest("hex").slice(0, 8);
  const owner = JSON.parse(readFileSync(".local-tests/owner.json", "utf8"));
  if (owner.root !== process.cwd() || owner.projectId !== project)
    throw Error("Owned fixture source required");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient<Database>(
    api,
    process.env.TEST_SUPABASE_SECRET_KEY!,
    options,
  );
  const clients = Array.from({ length: 4 }, () =>
    createClient<Database>(
      api,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      options,
    ),
  );
  const users: { id: string; email: string }[] = [];
  const sites: string[] = [];
  const password = randomUUID();
  async function cleanup() {
    for (const id of sites) {
      if (!/^[a-f0-9-]{36}$/.test(id)) throw Error("Invalid fixture ID");
      execFileSync(
        "docker",
        [
          "exec",
          "-i",
          `supabase_db_${project}`,
          "psql",
          "-XqAt",
          "-U",
          "postgres",
          "-d",
          "postgres",
          "-v",
          "ON_ERROR_STOP=1",
        ],
        {
          input: `begin;
    delete from public.contract_events where contract_id in(select id from public.contracts where site_id='${id}');
    delete from private.contract_files where version_id in(select v.id from public.contract_versions v join public.contracts c on c.id=v.contract_id where c.site_id='${id}');
    delete from public.contract_versions where contract_id in(select id from public.contracts where site_id='${id}');
    delete from public.contracts where site_id='${id}';
    delete from public.site_memberships where site_id='${id}';delete from public.buildings where site_id='${id}';delete from public.sites where id='${id}';commit;`,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
    }
    for (const user of users) {
      expect(
        (await admin.from("facility_managers").delete().eq("user_id", user.id))
          .error,
      ).toBeNull();
      expect((await admin.auth.admin.deleteUser(user.id)).error).toBeNull();
    }
  }
  try {
    for (let i = 0; i < 4; i++) {
      const email = `contract-ui-${randomUUID()}@example.test`;
      const made = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (made.error || !made.data.user) throw Error("Fixture creation failed");
      users.push({ id: made.data.user.id, email });
      expect(
        (await clients[i].auth.signInWithPassword({ email, password })).error,
      ).toBeNull();
    }
    expect(
      (
        await admin.from("service_staff").insert([
          { user_id: users[0].id, display_name: "Contract manager" },
          { user_id: users[3].id, display_name: "Ordinary engineer" },
        ])
      ).error,
    ).toBeNull();
    expect(
      (await admin.from("facility_managers").insert({ user_id: users[0].id }))
        .error,
    ).toBeNull();
    sites.push(randomUUID(), randomUUID());
    expect(
      (
        await admin.from("sites").insert(
          sites.map((id, i) => ({
            id,
            name: `Contract site ${i}`,
            customer_name: "Fixture customer",
          })),
        )
      ).error,
    ).toBeNull();
    expect(
      (
        await admin
          .from("site_memberships")
          .insert(
            sites.map((site_id, i) => ({ site_id, user_id: users[i + 1].id })),
          )
      ).error,
    ).toBeNull();
  } catch (e) {
    await cleanup();
    throw e;
  }
  return {
    admin,
    clients,
    users,
    sites,
    cleanup,
    async login(page: Page, actor = 0) {
      await page.goto("/login");
      await page.getByLabel("Email address").fill(users[actor].email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
    },
  };
}

test("manager creates and edits site; concurrent stale edit and non-manager access are rejected", async ({
  page,
}) => {
  const f = await fixture();
  let other: Page | undefined;
  try {
    await f.login(page);
    await page.goto("/dashboard/sites");
    await page.getByRole("link", { name: "New site", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "New site", exact: true }),
    ).toBeVisible();
    const id = new URL(page.url()).searchParams.get("draft")!;
    f.sites.push(id);
    await page.getByLabel("Site name", { exact: true }).fill("Managed office");
    await page.getByLabel("Customer", { exact: true }).fill("Office customer");
    await page.getByLabel("Contact email").fill("office@example.test");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(new RegExp("/sites/" + id + "$"));
    await expect(
      page.getByRole("heading", { name: "Managed office", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Edit site", exact: true }).click();
    other = await page.context().newPage();
    await other.goto(`/dashboard/sites/${id}/edit`);
    await expect(other.getByLabel("Site name")).toHaveValue("Managed office");
    await page.getByLabel("Site name").fill("Updated office");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Updated office", exact: true }),
    ).toBeVisible();
    await other.getByLabel("Site name").fill("Stale office");
    await other.getByRole("button", { name: "Save", exact: true }).click();
    await expect(other.locator("form").getByRole("alert")).toContainText(
      "changed",
    );
    await expect(other.getByLabel("Site name")).toHaveValue("Stale office");
    const saved = await f.admin
      .from("sites")
      .select("name,version")
      .eq("id", id)
      .single();
    expect(saved.data).toEqual({ name: "Updated office", version: 2 });
    const denied = await f.clients[3].rpc("save_site", {
      p_id: id,
      p_expected_version: 2,
      p_details: {
        name: "Hacked",
        address: "",
        customer_name: "",
        contact_name: "",
        contact_email: "",
        contact_phone: "",
        is_archived: false,
      },
    });
    expect(denied.error?.code).toBe("42501");
  } finally {
    await other?.close();
    await f.cleanup();
  }
});

test("PDF versions remain private until publication; replacing or revoking publication changes download access", async ({
  page,
  browser,
}) => {
  const f = await fixture();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const clientPage = await ctx.newPage();
  const pdf = Buffer.from("%PDF-1.4\nFirst contract edition\n%%EOF");
  try {
    await f.login(page);
    await page.goto(`/dashboard/sites/${f.sites[0]}/contracts`);
    await page.getByRole("link", { name: "New contract", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "New contract", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Contract number").fill("CP-2026-1");
    await page.getByLabel("Contract title").fill("First service agreement");
    await page.getByLabel("Service provider").fill("Fixture service");
    await page.getByLabel("Starts on").fill("2026-01-01");
    await page.getByLabel("Responsible staff").selectOption(f.users[0].id);
    await page.getByLabel("Contract PDF", { exact: false }).setInputFiles({
      name: "contract.pdf",
      mimeType: "application/pdf",
      buffer: pdf,
    });
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Contract versions", exact: true }),
    ).toBeVisible();
    const url = new URL(page.url()).pathname;
    const id = url.split("/").at(-1)!;
    const rows = await f.admin
      .from("contract_versions")
      .select("id")
      .eq("contract_id", id);
    expect(rows.data).toHaveLength(1);
    const v1 = rows.data![0].id;
    expect(
      (await f.clients[1].from("contracts").select("id").eq("id", id)).data,
    ).toEqual([]);
    const file = await page.request.get(`/api/facility/files/${v1}`);
    expect(file.status()).toBe(200);
    expect(file.headers()["content-disposition"]).toContain("attachment;");
    expect(await file.body()).toEqual(pdf);
    const article = page.getByRole("article").filter({
      has: page.getByRole("heading", {
        name: "First service agreement",
        exact: true,
      }),
    });
    await article.getByRole("checkbox").check();
    await article
      .getByRole("button", { name: "Publish version 1", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Remove client publication" }),
    ).toBeVisible();
    await f.login(clientPage, 1);
    await clientPage.goto(url);
    await expect(
      clientPage.getByRole("heading", {
        name: "First service agreement",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      clientPage.getByRole("link", { name: "New version", exact: true }),
    ).toHaveCount(0);
    expect(
      (await clientPage.request.get(`/api/facility/files/${v1}`)).status(),
    ).toBe(200);
    expect(
      (await f.clients[2].rpc("download_contract_file", { p_version_id: v1 }))
        .data,
    ).toEqual([]);
    const denied = await clientPage.request.post("/api/facility/manage", {
      headers: { Origin: new URL(clientPage.url()).origin },
      data: { action: "publish", id, revision: 2, version_id: null },
    });
    expect(denied.status()).toBe(403);
    await page.getByRole("link", { name: "New version", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "New contract version", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Contract title").fill("Second internal edition");
    await page.getByLabel("Contract PDF", { exact: false }).setInputFiles({
      name: "second.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\nSecond edition\n%%EOF"),
    });
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Second internal edition",
        exact: true,
      }),
    ).toBeVisible();
    const versions = await f.admin
      .from("contract_versions")
      .select("id,version")
      .eq("contract_id", id)
      .order("version");
    expect(versions.data).toHaveLength(2);
    const v2 = versions.data![1].id;
    await clientPage.reload();
    await expect(
      clientPage.getByRole("heading", {
        name: "First service agreement",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      clientPage.getByText("Second internal edition", { exact: true }),
    ).toHaveCount(0);
    expect(
      (await clientPage.request.get(`/api/facility/files/${v2}`)).status(),
    ).toBe(404);
    const second = page.getByRole("article").filter({
      has: page.getByRole("heading", {
        name: "Second internal edition",
        exact: true,
      }),
    });
    await second.getByRole("checkbox").check();
    await second.getByRole("button", { name: "Publish version 2" }).click();
    await expect(second.getByText(/Published to site clients/)).toBeVisible();
    await clientPage.reload();
    await expect(
      clientPage.getByRole("heading", {
        name: "Second internal edition",
        exact: true,
      }),
    ).toBeVisible();
    expect(
      (await clientPage.request.get(`/api/facility/files/${v1}`)).status(),
    ).toBe(404);
    const remove = page.locator("form").filter({
      has: page.getByRole("button", { name: "Remove client publication" }),
    });
    await remove.getByRole("checkbox").check();
    const removed = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/facility/manage") &&
        response.request().method() === "POST",
    );
    await remove
      .getByRole("button", { name: "Remove client publication" })
      .click();
    expect((await removed).status()).toBe(200);
    await expect(
      second.getByRole("button", { name: "Publish version 2" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Remove client publication" }),
    ).toHaveCount(0);
    expect(
      (await clientPage.request.get(`/api/facility/files/${v2}`)).status(),
    ).toBe(404);
    expect(
      (await f.clients[1].from("contracts").select("id").eq("id", id)).data,
    ).toEqual([]);
    expect(
      await clientPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await ctx.close();
    await f.cleanup();
  }
});

test("lost save acknowledgement keeps operation identity; role revoke and cross-origin writes fail closed", async ({
  page,
}) => {
  const f = await fixture();
  try {
    await f.login(page);
    await page.goto("/dashboard/sites/new");
    await expect(
      page.getByRole("heading", { name: "New site", exact: true }),
    ).toBeVisible();
    const id = new URL(page.url()).searchParams.get("draft")!;
    f.sites.push(id);
    await page.getByLabel("Site name").fill("Acknowledgement probe");
    await page.route("**/api/facility/manage", async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort("failed");
    });
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText(
      "Save result is not confirmed",
    );
    await page.unroute("**/api/facility/manage");
    await page.getByRole("button", { name: "Reload saved details" }).click();
    await expect(
      page.getByRole("heading", { name: "Edit site", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Site name")).toHaveValue(
      "Acknowledgement probe",
    );
    expect(
      (await f.admin.from("sites").select("id").eq("id", id)).data,
    ).toHaveLength(1);
    const csrf = await page.request.post("/api/facility/manage", {
      headers: { Origin: "https://untrusted.example" },
      data: { action: "site", id, revision: 1 },
    });
    expect(csrf.status()).toBe(403);
    expect(
      (
        await f.admin
          .from("facility_managers")
          .update({ is_active: false })
          .eq("user_id", f.users[0].id)
      ).error,
    ).toBeNull();
    const revoked = await page.request.post("/api/facility/manage", {
      headers: { Origin: new URL(page.url()).origin },
      data: { action: "site", id, revision: 1 },
    });
    expect(revoked.status()).toBe(403);
  } finally {
    await f.cleanup();
  }
});
