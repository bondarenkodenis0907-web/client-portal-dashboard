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
    for (const email of [
      clientEmail,
      staffEmail,
      `second-engineer-${suffix}@example.test`,
    ]) {
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
      .insert([
        {
          user_id: ids[1],
          display_name: "Alex Morgan · Service engineer",
        },
        {
          user_id: ids[2],
          display_name: "Taylor Lee · Service engineer",
        },
      ]);
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
    const completedWork =
      "Replaced the damaged PoE connector, restored the video feed and checked recording playback.";
    await staffPage.getByLabel("Completed work").fill(completedWork);
    await staffPage.getByLabel("Assigned engineer").selectOption(ids[2]);
    await staffPage.getByRole("button", { name: "Save assignment" }).click();
    // The history update proves the refreshed server revision has arrived.
    await expect(staffPage.getByRole("listitem")).toHaveCount(3);
    await expect(staffPage.getByLabel("Assigned engineer")).toHaveValue(ids[2]);
    await expect(staffPage.getByLabel("Completed work")).toHaveValue(
      completedWork,
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
      completedWork,
    );
    await staffPage.unroute("**/rest/v1/service_requests*");
    await staffPage.getByRole("button", { name: "Reload request" }).click();
    await expect(staffPage.getByLabel("Completed work")).toHaveValue(
      completedWork,
    );
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
    await expect(clientPage.getByRole("listitem")).toHaveCount(4);
    await expect(
      clientPage.getByRole("listitem").filter({
        hasText: "Alex Morgan · Service engineer",
      }),
    ).toHaveCount(1);
    await expect(
      clientPage.getByRole("listitem").filter({
        hasText: "Taylor Lee · Service engineer",
      }),
    ).toHaveCount(2);
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
    expect(saved?.assigned_to).toBe(ids[2]);
    expect(saved?.resolution).toBe(completedWork);
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

test("deactivation revokes an existing staff session and preserves request history", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname))
    throw new Error("Use an isolated local backend.");
  const admin = createClient<Database>(
    url,
    process.env.TEST_SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } },
  );
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const suffix = randomUUID();
  const password = randomUUID();
  const emails = [
    `owner-${suffix}@example.test`,
    `departing-engineer-${suffix}@example.test`,
    `active-engineer-${suffix}@example.test`,
  ];
  const ids: string[] = [];
  const inactiveName = "Jordan Quinn · Service engineer";
  const activeName = "Casey Reed · Service engineer";
  const completedWork = "Replaced the faulty recorder and checked playback.";
  const revokedContext = await browser.newContext();
  const activeContext = await browser.newContext();
  const revokedPage = await revokedContext.newPage();
  const activePage = await activeContext.newPage();
  const browserErrors: string[] = [];
  for (const page of [revokedPage, activePage])
    page.on("pageerror", (error) => browserErrors.push(error.message));
  async function signIn(page: Page, email: string) {
    await page.goto("/login");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  }
  try {
    for (const email of emails) {
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
      .insert([
        { user_id: ids[1], display_name: inactiveName },
        { user_id: ids[2], display_name: activeName },
      ]);
    if (membershipError) throw membershipError;
    const { data: requests, error: requestError } = await admin
      .from("service_requests")
      .insert([
        {
          user_id: ids[0],
          site: "Closed client issue",
          system: "CCTV",
          description: "The recorder cannot play back saved footage.",
        },
        {
          user_id: ids[0],
          site: "Open client issue",
          system: "Access control",
          description: "The main entrance reader is intermittently offline.",
        },
        {
          user_id: ids[0],
          site: "New client issue",
          system: "CCTV",
          description: "The loading-bay camera needs investigation.",
        },
        {
          user_id: ids[1],
          site: "Own client issue",
          system: "Alarm",
          description: "The engineer also has a personal client request.",
        },
      ])
      .select("id, site");
    if (requestError || !requests)
      throw requestError ?? new Error("Test request creation failed");
    function requestId(site: string) {
      const id = requests!.find((request) => request.site === site)?.id;
      if (!id) throw new Error("Test request was not created");
      return id;
    }
    const closedId = requestId("Closed client issue");
    const openId = requestId("Open client issue");
    const newId = requestId("New client issue");
    const ownId = requestId("Own client issue");
    const activeApi = createClient<Database>(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: activeLoginError } = await activeApi.auth.signInWithPassword(
      {
        email: emails[2],
        password,
      },
    );
    if (activeLoginError) throw activeLoginError;
    for (const id of [closedId, openId]) {
      const { error } = await activeApi
        .from("service_requests")
        .update({ assigned_to: ids[1], status: "in_progress" })
        .eq("id", id);
      if (error) throw error;
    }
    const { error: closureError } = await activeApi
      .from("service_requests")
      .update({ status: "closed", resolution: completedWork })
      .eq("id", closedId);
    if (closureError) throw closureError;

    const revokedAuth = createClient<Database>(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: login, error: loginError } =
      await revokedAuth.auth.signInWithPassword({ email: emails[1], password });
    if (loginError || !login.session)
      throw loginError ?? new Error("Test staff sign-in failed");
    // Keep the original JWT for every API assertion, without refreshing it.
    const revokedApi = createClient<Database>(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: { Authorization: `Bearer ${login.session.access_token}` },
      },
    });
    const before = await revokedApi
      .from("service_requests")
      .select("id")
      .in("id", [closedId, openId, newId, ownId]);
    expect(before.error).toBeNull();
    expect(before.data).toHaveLength(4);
    await signIn(revokedPage, emails[1]);
    await revokedPage.goto("/dashboard/staff");
    await expect(
      revokedPage.getByRole("link", { name: "Open client issue", exact: true }),
    ).toBeVisible();
    await signIn(activePage, emails[2]);

    const { error: deactivationError } = await admin
      .from("service_staff")
      .update({ is_active: false })
      .eq("user_id", ids[1]);
    if (deactivationError) throw deactivationError;
    const [otherRequests, directory, events, update, ownRequest, ownEvents] =
      await Promise.all([
        revokedApi
          .from("service_requests")
          .select("id")
          .in("id", [closedId, openId, newId]),
        revokedApi.from("service_staff").select("user_id"),
        revokedApi
          .from("request_events")
          .select("id")
          .eq("request_id", closedId),
        revokedApi
          .from("service_requests")
          .update({ assigned_to: ids[2], status: "in_progress" })
          .eq("id", openId)
          .select("id"),
        revokedApi.from("service_requests").select("id").eq("id", ownId),
        revokedApi.from("request_events").select("id").eq("request_id", ownId),
      ]);
    for (const result of [otherRequests, directory, events, update]) {
      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
    }
    expect(ownRequest.error).toBeNull();
    expect(ownRequest.data).toEqual([{ id: ownId }]);
    expect(ownEvents.error).toBeNull();
    expect(ownEvents.data).toHaveLength(1);
    const selfReactivation = await revokedApi
      .from("service_staff")
      .update({ is_active: true })
      .eq("user_id", ids[1]);
    expect(selfReactivation.error?.code).toBe("42501");
    const stillAssigned = await admin
      .from("service_requests")
      .select("assigned_to")
      .eq("id", openId)
      .single();
    expect(stillAssigned.error).toBeNull();
    expect(stillAssigned.data?.assigned_to).toBe(ids[1]);

    await revokedPage.reload();
    await expect(revokedPage).toHaveURL(/\/dashboard$/);
    await expect(
      revokedPage.getByRole("link", { name: "Service queue", exact: true }),
    ).toHaveCount(0);
    await revokedPage.goto(`/dashboard/requests/${ownId}`);
    await expect(
      revokedPage.getByRole("heading", {
        name: "Own client issue",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      revokedPage.getByRole("heading", { name: "What happens next" }),
    ).toBeVisible();

    await activePage.goto(`/dashboard/requests/${closedId}`);
    await expect(
      activePage.getByRole("heading", { name: "Work completed" }),
    ).toBeVisible();
    await expect(activePage.getByRole("listitem")).toHaveCount(3);
    await expect(
      activePage.getByRole("listitem").filter({ hasText: inactiveName }),
    ).toHaveCount(2);
    await expect(
      activePage.locator("section").filter({
        has: activePage.getByRole("heading", { name: "Reported issue" }),
      }),
    ).toContainText(inactiveName);
    const closed = await admin
      .from("service_requests")
      .select("assigned_to, status, resolution, closed_at")
      .eq("id", closedId)
      .single();
    expect(closed.error).toBeNull();
    expect(closed.data?.assigned_to).toBe(ids[1]);
    expect(closed.data?.status).toBe("closed");
    expect(closed.data?.resolution).toBe(completedWork);
    expect(closed.data?.closed_at).toBeTruthy();

    await activePage.goto(`/dashboard/requests/${newId}`);
    await expect(
      activePage
        .getByLabel("Assigned engineer")
        .locator(`option[value="${ids[1]}"]`),
    ).toHaveCount(0);
    await expect(
      activePage
        .getByLabel("Assigned engineer")
        .locator(`option[value="${ids[2]}"]`),
    ).toHaveCount(1);
    const inactiveAssignment = await activeApi
      .from("service_requests")
      .update({ assigned_to: ids[1], status: "in_progress" })
      .eq("id", newId);
    expect(inactiveAssignment.error?.code).toBe("23514");

    await activePage.goto(`/dashboard/requests/${openId}`);
    await expect(
      activePage
        .getByLabel("Assigned engineer")
        .locator(`option[value="${ids[1]}"]`),
    ).toBeDisabled();
    await activePage.getByLabel("Assigned engineer").selectOption(ids[2]);
    await activePage.getByRole("button", { name: "Save assignment" }).click();
    await expect(activePage.getByRole("listitem")).toHaveCount(3);
    await expect(activePage.getByLabel("Assigned engineer")).toHaveValue(
      ids[2],
    );
    const reassigned = await admin
      .from("service_requests")
      .select("assigned_to, status")
      .eq("id", openId)
      .single();
    expect(reassigned.error).toBeNull();
    expect(reassigned.data).toEqual({
      assigned_to: ids[2],
      status: "in_progress",
    });
    expect(browserErrors).toEqual([]);
  } finally {
    await Promise.all([revokedContext.close(), activeContext.close()]);
    // Remove requests before memberships so historical assignment FKs stay valid.
    if (ids.length) {
      await admin.from("service_requests").delete().in("user_id", ids);
      await admin.from("service_staff").delete().in("user_id", ids);
      for (const id of ids) await admin.auth.admin.deleteUser(id);
    }
  }
});
