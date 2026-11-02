import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import type { Database } from "../../src/lib/supabase/database.types";

test.use({ trace: "off" });
const api = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const rpcPattern = "**/rest/v1/rpc/process_service_request*";
async function fixture() {
  if (api !== "http://127.0.0.1:56321")
    throw Error("Dedicated local API required");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient<Database>(
    api,
    process.env.TEST_SUPABASE_SECRET_KEY!,
    options,
  );
  const makeClient = () =>
    createClient<Database>(
      api,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      options,
    );
  const clients = [makeClient(), makeClient(), makeClient()];
  const password = randomUUID();
  const emails = [0, 1, 2].map(
    (index) => `sr07-${index}-${randomUUID()}@example.test`,
  );
  const ids: string[] = [];
  let requestId = "";
  async function cleanup() {
    // Removing the owner first cascades request fixtures before staff FK removal.
    for (const id of ids) {
      const removed = await admin.auth.admin.deleteUser(id);
      if (removed.error) throw Error("Local SR07 cleanup failed");
    }
  }
  try {
    for (let index = 0; index < 3; index++) {
      const made = await admin.auth.admin.createUser({
        email: emails[index],
        password,
        email_confirm: true,
      });
      if (made.error || !made.data.user)
        throw Error("Local SR07 fixture failed");
      ids.push(made.data.user.id);
      const signedIn = await clients[index].auth.signInWithPassword({
        email: emails[index],
        password,
      });
      if (signedIn.error) throw Error("Local SR07 fixture sign-in failed");
    }
    const staff = await admin.from("service_staff").insert([
      { user_id: ids[1], display_name: "SR07 Engineer A" },
      { user_id: ids[2], display_name: "SR07 Engineer B" },
    ]);
    if (staff.error) throw Error("Local SR07 directory failed");
    const created = await clients[0]
      .rpc("create_service_request", {
        p_operation_key: randomUUID(),
        p_site: "SR07 test office",
        p_system: "CCTV",
        p_description: "Camera offline",
        p_priority: "medium",
      })
      .select("id")
      .single();
    if (created.error) throw Error("Local SR07 creation failed");
    requestId = created.data.id;
  } catch (error) {
    await cleanup();
    throw error;
  }
  return {
    admin,
    clients,
    ids,
    requestId,
    cleanup,
    args: (
      version: number,
      status = "in_progress",
      assignee = ids[1],
      resolution = "",
    ) => ({
      p_request_id: requestId,
      p_expected_version: version,
      p_assigned_to: assignee,
      p_status: status,
      p_resolution: resolution,
    }),
    async start() {
      const started = await clients[1].rpc("process_service_request", {
        p_request_id: requestId,
        p_expected_version: 1,
        p_assigned_to: ids[1],
        p_status: "in_progress",
        p_resolution: "",
      });
      if (started.error) throw Error("Local SR07 start failed");
    },
    async signIn(page: Page, actor: 1 | 2) {
      await page.goto("/login");
      await page.getByLabel("Email address").fill(emails[actor]);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
      await page.goto(`/dashboard/requests/${requestId}`);
      await expect(
        page.getByRole("button", { name: "Close request", exact: true }),
      ).toBeVisible();
    },
    async saved() {
      const row = await admin
        .from("service_requests")
        .select(
          "assigned_to, status, resolution, version, expected_version, updated_at, closed_at",
        )
        .eq("id", requestId)
        .single();
      const events = await admin
        .from("request_events")
        .select("id, status, resolution")
        .eq("request_id", requestId)
        .order("id");
      if (row.error || events.error)
        throw Error("Local SR07 verification failed");
      return { row: row.data, events: events.data };
    },
  };
}
const form = (page: Page) => page.locator("form[aria-busy]");
const close = (page: Page) =>
  page.getByRole("button", { name: "Close request", exact: true }).click();
const reload = (page: Page) =>
  page.getByRole("button", { name: "Reload request", exact: true }).click();
const keep = (page: Page) =>
  page
    .getByRole("button", { name: "Keep my edits and continue", exact: true })
    .click();

test("two engineers cannot replace a winning closure; reload failures and closed review preserve the draft", async ({
  page,
  browser,
}) => {
  const user = await fixture();
  const secondContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const second = await secondContext.newPage();
  try {
    await user.start();
    await user.signIn(page, 1);
    await user.signIn(second, 2);
    const winnerText = "Repaired the connector and verified the recording.";
    const draft = "My unsaved investigation notes must remain available.";
    await page.getByLabel("Completed work").fill(winnerText);
    await second.getByLabel("Completed work").fill(draft);
    await second.getByLabel("Assigned engineer").selectOption(user.ids[2]);
    await close(page);
    await expect(
      page.getByRole("heading", { name: "Work completed", exact: true }),
    ).toBeVisible();
    const winner = await user.saved();
    let attempts = 0;
    second.on("request", (request) => {
      if (
        request.url().includes("/rpc/process_service_request") &&
        request.method() === "POST"
      )
        attempts++;
    });
    await close(second);
    await expect(form(second).getByRole("alert")).toContainText(
      "This request changed",
    );
    await expect(second.getByLabel("Completed work")).toHaveValue(draft);
    await expect(second.getByLabel("Assigned engineer")).toHaveValue(
      user.ids[2],
    );
    await expect(
      second.getByRole("button", { name: "Close request", exact: true }),
    ).toBeDisabled();
    expect(await user.saved()).toEqual(winner);
    await second.route("**/rest/v1/service_requests*", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          code: "LOCAL_READ_UNAVAILABLE",
          message: "Local read failure",
        }),
      }),
    );
    await reload(second);
    await expect(form(second).getByRole("alert")).toContainText(
      "Unable to load the latest request",
    );
    await expect(second.getByLabel("Completed work")).toHaveValue(draft);
    await second.unroute("**/rest/v1/service_requests*");
    await reload(second);
    const latest = second.getByRole("region", { name: "Latest saved request" });
    await expect(latest).toContainText(winnerText);
    await expect(latest).toContainText("already closed");
    await expect(
      second.getByRole("button", { name: "Keep my edits and continue" }),
    ).toHaveCount(0);
    await expect(second.getByLabel("Completed work")).toHaveValue(draft);
    expect(
      await second.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(attempts).toBe(1);
    expect(await user.saved()).toEqual(winner);
    await second
      .getByRole("button", { name: "Use saved details and discard my edits" })
      .click();
    await expect(second.getByLabel("Completed work")).toHaveCount(0);
    expect(winner.row.version).toBe(3);
    expect(winner.row.resolution).toBe(winnerText);
    expect(winner.events).toHaveLength(3);
  } finally {
    await secondContext.close();
    await user.cleanup();
  }
});

test("review keeps edits without autosave; another change after review still conflicts", async ({
  page,
  browser,
}) => {
  const user = await fixture();
  const secondContext = await browser.newContext();
  const second = await secondContext.newPage();
  try {
    await user.start();
    await user.signIn(page, 1);
    await user.signIn(second, 2);
    const draft = "Preserved repair notes following an assignment conflict.";
    await second.getByLabel("Completed work").fill(draft);
    await page.getByLabel("Assigned engineer").selectOption(user.ids[2]);
    await page
      .getByRole("button", { name: "Save assignment", exact: true })
      .click();
    await expect(page.getByRole("listitem")).toHaveCount(3);
    await close(second);
    await expect(form(second).getByRole("alert")).toContainText(
      "This request changed",
    );
    await reload(second);
    await expect(
      second.getByRole("region", { name: "Latest saved request" }),
    ).toContainText("SR07 Engineer B");
    const raced = await user.clients[1].rpc(
      "process_service_request",
      user.args(3, "in_progress", user.ids[1]),
    );
    expect(raced.error).toBeNull();
    await keep(second);
    await expect(second.getByLabel("Assigned engineer")).toHaveValue(
      user.ids[2],
    );
    await expect(second.getByLabel("Completed work")).toHaveValue(draft);
    expect((await user.saved()).row.version).toBe(4); // No autosave or silent rebase.
    await close(second);
    await expect(form(second).getByRole("alert")).toContainText(
      "This request changed",
    );
    expect((await user.saved()).row.status).toBe("in_progress");
    await reload(second);
    await keep(second);
    await expect(second.getByLabel("Completed work")).toHaveValue(draft);
    await close(second);
    await expect(
      second.getByRole("heading", { name: "Work completed", exact: true }),
    ).toBeVisible();
    const saved = await user.saved();
    expect(saved.row.version).toBe(5);
    expect(saved.row.resolution).toBe(draft);
    expect(saved.row.assigned_to).toBe(user.ids[1]);
    expect(saved.events).toHaveLength(5);
  } finally {
    await secondContext.close();
    await user.cleanup();
  }
});

test("lost response after committed processing never repeats the write automatically", async ({
  page,
}) => {
  const user = await fixture();
  try {
    await user.start();
    await user.signIn(page, 1);
    const draft = "Repaired the cable and verified the live video stream.";
    await page.getByLabel("Completed work").fill(draft);
    let writes = 0;
    page.on("request", (request) => {
      if (
        request.url().includes("/rpc/process_service_request") &&
        request.method() === "POST"
      )
        writes++;
    });
    await page.route(
      rpcPattern,
      async (route) => {
        const response = await route.fetch();
        if (!response.ok())
          throw Error("Expected a committed local processing update");
        await route.abort("failed");
      },
      { times: 1 },
    );
    await close(page);
    await expect(form(page).getByRole("alert")).toContainText(
      "Saving could not be confirmed",
    );
    await expect(page.getByLabel("Completed work")).toHaveValue(draft);
    await expect(
      page.getByRole("button", { name: "Close request", exact: true }),
    ).toBeDisabled();
    await form(page).evaluate((element) =>
      element.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    const saved = await user.saved();
    expect(saved.row.version).toBe(3);
    expect(saved.row.resolution).toBe(draft);
    expect(saved.events).toHaveLength(3);
    await reload(page);
    await expect(
      page.getByRole("region", { name: "Latest saved request" }),
    ).toContainText(draft);
    await expect(page.getByLabel("Completed work")).toHaveValue(draft);
    expect(writes).toBe(1);
    expect(await user.saved()).toEqual(saved);
  } finally {
    await user.cleanup();
  }
});

test("a history read failure preserves both the confirmed assignment and unfinished work notes", async ({
  page,
}) => {
  const user = await fixture();
  try {
    await user.start();
    await user.signIn(page, 1);
    const draft = "Unfinished notes must survive a failed history refresh.";
    await page.getByLabel("Completed work").fill(draft);
    await page.getByLabel("Assigned engineer").selectOption(user.ids[2]);
    await page.route("**/rest/v1/request_events*", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          code: "LOCAL_HISTORY_UNAVAILABLE",
          message: "Local history failure",
        }),
      }),
    );
    await page
      .getByRole("button", { name: "Save assignment", exact: true })
      .click();
    await expect(form(page).getByRole("status")).toContainText(
      "Changes saved. History could not be refreshed",
    );
    await expect(page.getByLabel("Completed work")).toHaveValue(draft);
    await expect(page.getByLabel("Assigned engineer")).toHaveValue(user.ids[2]);
    const confirmed = await user.saved();
    expect(confirmed.row.version).toBe(3);
    expect(confirmed.row.assigned_to).toBe(user.ids[2]);
    expect(confirmed.events).toHaveLength(3);
    await reload(page);
    await expect(form(page).getByRole("alert")).toContainText(
      "Unable to load the latest request",
    );
    await expect(page.getByLabel("Completed work")).toHaveValue(draft);
    expect(await user.saved()).toEqual(confirmed);
    await page.unroute("**/rest/v1/request_events*");
    await reload(page);
    await keep(page);
    await expect(page.getByRole("listitem")).toHaveCount(3);
    await expect(page.getByLabel("Completed work")).toHaveValue(draft);
    await close(page);
    await expect(
      page.getByRole("heading", { name: "Work completed", exact: true }),
    ).toBeVisible();
    const saved = await user.saved();
    expect(saved.row.version).toBe(4);
    expect(saved.row.resolution).toBe(draft);
    expect(saved.events).toHaveLength(4);
  } finally {
    await user.cleanup();
  }
});

test("concurrent RPC and direct PATCH wait for the winner then reject the stale version", async () => {
  const user = await fixture();
  const container =
    "supabase_db_client-portal-tests-" +
    createHash("sha256").update(process.cwd()).digest("hex").slice(0, 8);
  const dockerArgs = (sql: string) => [
    "exec",
    container,
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-At",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    sql,
  ];
  const query = (sql: string) =>
    execFileSync("docker", dockerArgs(sql), {
      encoding: "utf8",
      windowsHide: true,
    }).trim();
  let winner: Promise<unknown> | undefined;
  try {
    await user.start();
    const sql = `begin; set local role authenticated; set local request.jwt.claim.sub='${user.ids[1]}'; select count(*) from public.process_service_request('${user.requestId}',2,'${user.ids[2]}','in_progress',null); select pg_sleep(4); commit;`;
    winner = promisify(execFile)("docker", dockerArgs(sql), {
      windowsHide: true,
    });
    await expect
      .poll(
        () =>
          Number(
            query(
              `select count(*) from pg_stat_activity where wait_event='PgSleep' and query like '%${user.requestId}%'`,
            ),
          ),
        { timeout: 8000 },
      )
      .toBe(1);
    const updates = Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        index % 2
          ? user.clients[2].rpc(
              "process_service_request",
              user.args(2, "closed", user.ids[1], "A losing repair result"),
            )
          : user.clients[2]
              .from("service_requests")
              .update({
                expected_version: 2,
                assigned_to: user.ids[1],
                status: "closed",
                resolution: "A losing repair result",
              })
              .eq("id", user.requestId)
              .select("id"),
      ),
    );
    await expect
      .poll(
        () =>
          Number(
            query(
              "select count(*) from pg_stat_activity where wait_event='transactionid' and (query like '%process_service_request%' or query like '%service_requests%')",
            ),
          ),
        { timeout: 3000 },
      )
      .toBeGreaterThan(0);
    const results = await updates;
    await winner;
    expect(
      results.every(
        (result) => result.error?.code === "PT409" && result.status === 409,
      ),
    ).toBe(true);
    const saved = await user.saved();
    expect(saved.row.version).toBe(3);
    expect(saved.row.assigned_to).toBe(user.ids[2]);
    expect(saved.row.status).toBe("in_progress");
    expect(saved.row.resolution).toBeNull();
    expect(saved.row.expected_version).toBeNull();
    expect(saved.events).toHaveLength(3);
  } finally {
    await winner?.catch(() => {});
    await user.cleanup();
  }
});

test("the HTTP API requires a version, forbids forged versions and retains client permissions", async () => {
  const user = await fixture();
  try {
    const missing = await user.clients[1]
      .from("service_requests")
      .update({ assigned_to: user.ids[1], status: "in_progress" })
      .eq("id", user.requestId);
    expect(missing.error?.code).toBe("22023");
    const empty = await user.clients[1]
      .from("service_requests")
      .update({
        expected_version: null,
        assigned_to: user.ids[1],
        status: "in_progress",
      })
      .eq("id", user.requestId);
    expect(empty.error?.code).toBe("22023");
    const forged = await user.clients[1]
      .from("service_requests")
      .update({
        expected_version: 1,
        version: 100,
        assigned_to: user.ids[1],
        status: "in_progress",
      })
      .eq("id", user.requestId);
    expect(forged.error?.code).toBe("42501");
    const future = await user.clients[1].rpc(
      "process_service_request",
      user.args(100),
    );
    expect(future.error?.code).toBe("PT409");
    const ordinary = await user.clients[0].rpc(
      "process_service_request",
      user.args(1),
    );
    expect(ordinary.error?.code).toBe("42501");
    const session = await user.clients[1].auth.getSession();
    const response = await fetch(api + "/rest/v1/rpc/process_service_request", {
      method: "POST",
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        Authorization: `Bearer ${session.data.session!.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_request_id: user.requestId,
        p_assigned_to: user.ids[1],
        p_status: "in_progress",
        p_resolution: "",
      }),
    });
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("PGRST202");
    const saved = await user.saved();
    expect(saved.row.version).toBe(1);
    expect(saved.row.status).toBe("new");
    expect(saved.events).toHaveLength(1);
  } finally {
    await user.cleanup();
  }
});
