import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import type { Database } from "../../src/lib/supabase/database.types";

test.use({ trace: "off" }); // Do not retain synthetic Auth credentials in traces.
const api = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const rpcPattern = "**/rest/v1/rpc/create_service_request*";
const args = (key: string, description = "Camera offline") => ({
  p_operation_key: key,
  p_site: "SR06 test office",
  p_system: "CCTV",
  p_description: description,
  p_priority: "medium",
});
async function fixture() {
  if (api !== "http://127.0.0.1:56321")
    throw Error("Dedicated local API required");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient<Database>(
    api,
    process.env.TEST_SUPABASE_SECRET_KEY!,
    options,
  );
  const client = createClient<Database>(
    api,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    options,
  );
  const email = `sr06-${randomUUID()}@example.test`;
  const password = randomUUID();
  const made = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (made.error || !made.data.user) throw Error("Local fixture failed");
  const id = made.data.user.id;
  return {
    admin,
    client,
    email,
    password,
    id,
    async signIn(page: Page) {
      await page.goto("/login");
      await page.getByLabel("Email address").fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
      await page.goto("/dashboard/requests");
    },
    async counts() {
      const requests = await admin
        .from("service_requests")
        .select("id, operation_key")
        .eq("user_id", id);
      if (requests.error) throw Error("Fixture read failed");
      const ids = requests.data.map((row) => row.id);
      const events = ids.length
        ? await admin.from("request_events").select("id").in("request_id", ids)
        : { data: [], error: null };
      if (events.error) throw Error("Fixture events read failed");
      return { requests: requests.data, events: events.data! };
    },
    async cleanup() {
      const removed = await admin.auth.admin.deleteUser(id);
      if (removed.error) throw Error("Local fixture cleanup failed");
    },
  };
}
async function fill(page: Page, description = "Camera offline") {
  await page
    .getByLabel("Site", { exact: false })
    .first()
    .fill("SR06 test office");
  await page.getByLabel("Technical system").fill("CCTV");
  await page.getByLabel("Issue description").fill(description);
}
const submit = (page: Page) =>
  page.getByRole("button", { name: "Create request", exact: true }).click();
async function loseCommittedResponse(page: Page) {
  await page.route(
    rpcPattern,
    async (route) => {
      const response = await route.fetch();
      if (!response.ok()) throw Error("Expected committed local creation");
      await route.abort("failed");
    },
    { times: 1 },
  );
  await submit(page);
  await expect(
    page.locator("form[aria-busy]").getByRole("alert"),
  ).toContainText("Unable to confirm");
}

test("lost response after actual commit: rapid submit and retry return one request/event", async ({
  page,
}) => {
  const user = await fixture();
  try {
    await user.signIn(page);
    await fill(page);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reached: () => void = () => {};
    const committed = new Promise<void>((resolve) => {
      reached = resolve;
    });
    let calls = 0;
    await page.route(
      rpcPattern,
      async (route) => {
        calls++;
        const response = await route.fetch();
        if (!response.ok()) throw Error("Expected local creation");
        reached();
        await gate;
        await route.abort("failed");
      },
      { times: 1 },
    );
    await submit(page);
    await committed;
    // Fire another submit event while the first response is still pending.
    await page
      .locator("form[aria-busy]")
      .evaluate((form) =>
        form.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
      );
    expect(calls).toBe(1);
    release();
    await expect(
      page.locator("form[aria-busy]").getByRole("alert"),
    ).toContainText("Unable to confirm");
    await expect(page.getByLabel("Issue description")).toHaveValue(
      "Camera offline",
    );
    const first = await user.counts();
    expect(first.requests).toHaveLength(1);
    expect(first.events).toHaveLength(1);
    await submit(page);
    await expect(page.getByRole("status")).toContainText(
      "Service request created",
    );
    const retried = await user.counts();
    expect(retried.requests).toEqual(first.requests);
    expect(retried.events).toHaveLength(1);
    await expect(
      page.getByRole("link", { name: "SR06 test office", exact: true }),
    ).toHaveCount(1);
    // A successful operation ends; an explicitly submitted next issue is separate.
    await fill(page);
    await submit(page);
    await expect(page.getByRole("status")).toContainText(
      "Service request created",
    );
    const separate = await user.counts();
    expect(separate.requests).toHaveLength(2);
    expect(
      new Set(separate.requests.map((row) => row.operation_key)).size,
    ).toBe(2);
    expect(separate.events).toHaveLength(2);
  } finally {
    await user.cleanup();
  }
});

test("pending operation survives reload and sign-in: re-entry confirms the existing request", async ({
  page,
}) => {
  const user = await fixture();
  try {
    await user.signIn(page);
    await fill(page);
    await loseCommittedResponse(page);
    const first = await user.counts();
    await page.reload();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await user.signIn(page);
    await fill(page);
    await submit(page);
    await expect(page.getByRole("status")).toContainText(
      "Service request created",
    );
    expect((await user.counts()).requests).toEqual(first.requests);
    expect((await user.counts()).events).toHaveLength(1);
    await expect(
      page.getByRole("link", { name: "SR06 test office", exact: true }),
    ).toHaveCount(1);
  } finally {
    await user.cleanup();
  }
});

test("edited retry conflicts; only explicit separate request can create another record", async ({
  page,
}) => {
  const user = await fixture();
  try {
    await user.signIn(page);
    await fill(page);
    await loseCommittedResponse(page);
    await page.reload();
    await fill(page, "Different problem");
    await submit(page);
    await expect(
      page.locator("form[aria-busy]").getByRole("alert"),
    ).toContainText("saved with different details");
    await expect(
      page.getByRole("link", { name: "Open saved request" }),
    ).toBeVisible();
    expect((await user.counts()).requests).toHaveLength(1);
    await page
      .getByRole("button", { name: "Start a separate request" })
      .click();
    await expect(page.getByLabel("Issue description")).toHaveValue(
      "Different problem",
    );
    await submit(page);
    await expect(page.getByRole("status")).toContainText(
      "Service request created",
    );
    const result = await user.counts();
    expect(result.requests).toHaveLength(2);
    expect(result.events).toHaveLength(2);
  } finally {
    await user.cleanup();
  }
});

test("unavailable browser storage blocks creation before any write", async ({
  page,
}) => {
  const user = await fixture();
  try {
    await user.signIn(page);
    await fill(page);
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith("portal:pending-request:"))
          throw Error("Storage unavailable");
        return original.call(this, key, value);
      };
    });
    let writes = 0;
    page.on("request", (request) => {
      if (request.url().includes("/rpc/create_service_request")) writes++;
    });
    await submit(page);
    await expect(
      page.locator("form[aria-busy]").getByRole("alert"),
    ).toContainText("browser storage");
    expect(writes).toBe(0);
    expect((await user.counts()).requests).toHaveLength(0);
  } finally {
    await user.cleanup();
  }
});

test("concurrent HTTP replays wait for an uncommitted winner; changed payload race conflicts", async () => {
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
    const login = await user.client.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });
    if (login.error) throw Error("Local fixture sign-in failed");
    const key = randomUUID();
    const sql = `begin; set local role authenticated; set local request.jwt.claim.sub='${user.id}'; select count(*) from public.create_service_request('${key}','SR06 test office','CCTV','Camera offline','medium'); select pg_sleep(4); commit;`;
    winner = promisify(execFile)("docker", dockerArgs(sql), {
      windowsHide: true,
    });
    await expect
      .poll(
        () =>
          Number(
            query(
              `select count(*) from pg_stat_activity where wait_event='PgSleep' and query like '%${key}%'`,
            ),
          ),
        { timeout: 8000 },
      )
      .toBe(1);
    const replays = Promise.all(
      Array.from({ length: 12 }, () =>
        user.client.rpc("create_service_request", args(key)),
      ),
    );
    // Observe real transaction-ID waits before the winner commits.
    await expect
      .poll(
        () =>
          Number(
            query(
              "select count(*) from pg_stat_activity where wait_event='transactionid' and query like '%create_service_request%'",
            ),
          ),
        { timeout: 3000 },
      )
      .toBeGreaterThan(0);
    const results = await replays;
    await winner;
    expect(
      results.every(
        (result) => result.error === null && result.data?.length === 1,
      ),
    ).toBe(true);
    expect(new Set(results.map((result) => result.data![0].id)).size).toBe(1);
    expect((await user.counts()).requests).toHaveLength(1);
    expect((await user.counts()).events).toHaveLength(1);
    const raceKey = randomUUID();
    const race = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        user.client.rpc(
          "create_service_request",
          args(raceKey, index % 2 ? "First problem" : "Second problem"),
        ),
      ),
    );
    expect(race.filter((result) => result.error === null)).toHaveLength(5);
    expect(
      race.filter(
        (result) => result.error?.code === "PT409" && result.status === 409,
      ),
    ).toHaveLength(5);
    expect((await user.counts()).requests).toHaveLength(2);
    expect((await user.counts()).events).toHaveLength(2);
  } finally {
    await winner?.catch(() => {});
    await user.cleanup();
  }
});
