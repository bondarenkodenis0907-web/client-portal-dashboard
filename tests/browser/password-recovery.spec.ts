import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import {
  changeRecoveryPassword,
  finishRecoverySignOut,
} from "../../src/lib/recovery-actions";

test.use({ trace: "off" }); // Recovery URLs/cookies must never become retained traces.
const origin = "http://127.0.0.1:3010";
const api = process.env.NEXT_PUBLIC_SUPABASE_URL!;

test("finish recovery without a session never confirms server logout", async ({
  page,
}) => {
  const response = await page.request.post(origin + "/auth/finish-recovery", {
    headers: { Origin: origin },
  });
  expect(response.status()).toBe(503);
  expect((await response.json()).complete).toBe(false);
});

test("real recovery session survives logout outages until a confirmed server retry revokes it", async () => {
  const user = await fixture();
  try {
    const link = await generatedLink(user);
    const verified = await user.publicClient.auth.verifyOtp({
      type: "recovery",
      token_hash: new URL(link).searchParams.get("token_hash")!,
    });
    if (verified.error || !verified.data.session)
      throw Error("Local recovery session failed");
    const session = verified.data.session;
    const jar = new Map([
      [
        "sb-127-auth-token",
        "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
      ],
    ]);
    let fail = true,
      globalCalls = 0,
      passwordWrites = 0;
    const make = () =>
      createServerClient(
        api,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
          global: {
            fetch: async (input, init) => {
              const url = new URL(String(input));
              if (url.pathname.endsWith("/user") && init?.method === "PUT")
                passwordWrites++;
              if (
                url.pathname.endsWith("/logout") &&
                url.searchParams.get("scope") === "global"
              ) {
                globalCalls++;
                if (fail)
                  return new Response(
                    JSON.stringify({
                      code: "unexpected_failure",
                      msg: "Synthetic logout outage",
                    }),
                    {
                      status: 503,
                      headers: { "Content-Type": "application/json" },
                    },
                  );
              }
              return fetch(input, init);
            },
          },
          cookies: {
            getAll: () => [...jar].map(([name, value]) => ({ name, value })),
            setAll: (items) =>
              items.forEach((x) =>
                x.options?.maxAge === 0
                  ? jar.delete(x.name)
                  : jar.set(x.name, x.value),
              ),
          },
        },
      );
    expect(await changeRecoveryPassword(make().auth, randomUUID())).toBe(
      "updated_logout_pending",
    );
    expect(jar.has("sb-127-auth-token")).toBe(true);
    expect(await finishRecoverySignOut(make().auth)).toBe(false);
    expect(globalCalls).toBe(2);
    const refreshed = await clients().publicClient.auth.refreshSession({
      refresh_token: session.refresh_token,
    });
    if (refreshed.error || !refreshed.data.session)
      throw Error("Expected live local session after failed logout");
    fail = false;
    expect(await finishRecoverySignOut(make().auth)).toBe(true);
    expect(globalCalls).toBe(3);
    expect(passwordWrites).toBe(1);
    expect(jar.has("sb-127-auth-token")).toBe(false);
    const revoked = await clients().publicClient.auth.refreshSession({
      refresh_token: refreshed.data.session.refresh_token,
    });
    expect(Boolean(revoked.error)).toBe(true);
  } finally {
    await user.cleanup();
  }
});
function clients() {
  if (api !== "http://127.0.0.1:56321")
    throw new Error("Use the dedicated local backend");
  return {
    admin: createClient(api, process.env.TEST_SUPABASE_SECRET_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    publicClient: createClient(
      api,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    ),
  };
}
async function fixture() {
  const { admin, publicClient } = clients();
  const email = `recovery-${randomUUID()}@example.test`;
  const password = `old-${randomUUID()}`;
  const result = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      amr: [{ method: "recovery", timestamp: Date.now() / 1000 }],
    },
  });
  if (result.error || !result.data.user)
    throw new Error("Local recovery fixture failed");
  const id = result.data.user.id;
  return {
    admin,
    publicClient,
    email,
    password,
    id,
    cleanup: async () => {
      const removed = await admin.auth.admin.deleteUser(id);
      if (removed.error)
        throw new Error("Local recovery fixture cleanup failed");
    },
  };
}
async function openLink(page: Page, link: string) {
  try {
    await page.goto(link);
  } catch {
    throw new Error("Local recovery navigation failed");
  }
  await expect.poll(() => new URL(page.url()).pathname).toBe("/auth/confirm");
}
async function generatedLink(user: Awaited<ReturnType<typeof fixture>>) {
  const result = await user.admin.auth.admin.generateLink({
    type: "recovery",
    email: user.email,
    options: { redirectTo: origin + "/auth/callback" },
  });
  if (result.error || !result.data.properties.hashed_token)
    throw new Error("Could not generate local link");
  return (
    origin +
    "/auth/callback?" +
    new URLSearchParams({
      token_hash: result.data.properties.hashed_token,
      type: "recovery",
    })
  );
}
async function verifyLink(page: Page, link: string) {
  await openLink(page, link);
  await page.getByRole("button", { name: "Continue password reset" }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/reset-password");
  await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
}
async function fillPasswords(page: Page, password: string) {
  await page.getByLabel("New password", { exact: true }).fill(password);
  await page.getByLabel("Confirm new password").fill(password);
}

test("recovery validates forms, rejects cross-site/malformed requests and fits mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect
    .poll(() => new URL(page.url()).pathname)
    .toBe("/forgot-password");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/reset-password");
  await expect(
    page.getByRole("alert").filter({ hasText: "Your reset link" }),
  ).toContainText("invalid or expired");
  const token = "a".repeat(64);
  const rejectedHeaders: Record<string, string>[] = [
    {},
    { Origin: "null" },
    { Origin: "https://evil.test" },
    { Origin: origin, "Sec-Fetch-Site": "cross-site" },
  ];
  for (const headers of rejectedHeaders) {
    const result = await page.request.post(origin + "/auth/verify-recovery", {
      headers,
      form: { token_hash: token },
      maxRedirects: 0,
    });
    expect(result.status()).toBe(403);
  }
  const unsupported = await page.request.post(
    origin + "/auth/verify-recovery",
    {
      headers: {
        Origin: origin,
        "Content-Type": "multipart/form-data; boundary=missing",
      },
      data: "broken",
      maxRedirects: 0,
    },
  );
  expect(unsupported.status()).toBe(415);
  const oversized = await page.request.post(origin + "/auth/verify-recovery", {
    headers: {
      Origin: origin,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    data: "x".repeat(4097),
    maxRedirects: 0,
  });
  expect(oversized.status()).toBe(400);
  const malformed = await page.request.post(origin + "/auth/update-password", {
    headers: { Origin: origin, "Content-Type": "application/json" },
    data: "{broken",
  });
  expect(malformed.status()).toBe(400);
  for (const path of [
    "/auth/callback?next=https://evil.test",
    "/auth/callback?type=recovery&token_hash=short",
  ]) {
    const result = await page.request.get(origin + path, { maxRedirects: 0 });
    expect(result.status()).toBe(303);
    expect(result.headers().location).toBe("/forgot-password?status=invalid");
  }
});

test("local email survives scanner GETs, changes password and revokes refresh sessions", async ({
  page,
}) => {
  const user = await fixture();
  try {
    const oldSession = await user.publicClient.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });
    if (oldSession.error || !oldSession.data.session)
      throw new Error("Local old session failed");
    await page.goto("/forgot-password");
    await page.getByLabel("Email address").fill(user.email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toContainText(
      "If an account exists",
    );
    const mailpit = "http://127.0.0.1:56324";
    const search =
      mailpit +
      "/api/v1/search?query=" +
      encodeURIComponent("to:" + user.email) +
      "&limit=1";
    await expect
      .poll(
        async () => (await (await fetch(search)).json()).messages?.length ?? 0,
        { timeout: 15000 },
      )
      .toBeGreaterThan(0);
    const messages = await (await fetch(search)).json();
    const message = await (
      await fetch(
        mailpit +
          "/api/v1/message/" +
          encodeURIComponent(messages.messages[0].ID),
      )
    ).json();
    const links = [
      ...(message.HTML ?? message.Text ?? "").matchAll(
        /https?:\/\/[^\s<>"']+/g,
      ),
    ].map((value) => value[0].replaceAll("&amp;", "&"));
    const link = links.find((value) => {
      const url = new URL(value);
      return (
        url.origin === origin &&
        url.pathname === "/auth/callback" &&
        url.searchParams.get("type") === "recovery"
      );
    });
    if (!link) throw new Error("Missing local recovery email link");
    const scan = await page.request.get(link, { maxRedirects: 0 });
    expect(scan.status()).toBe(303);
    expect(
      (await page.context().cookies()).some(
        (cookie) =>
          cookie.name === "sb-127-auth-token" ||
          cookie.name.startsWith("sb-127-auth-token."),
      ),
    ).toBe(false);
    await openLink(page, link);
    const landing = await page.reload();
    expect(await landing?.headerValue("cache-control")).toContain("no-store");
    expect(await landing?.headerValue("referrer-policy")).toBe("same-origin");
    await expect(page.getByLabel("New password", { exact: true })).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: "Continue password reset" }).click();
    await expect(
      page.getByLabel("New password", { exact: true }),
    ).toBeVisible();
    const replacement = `new-${randomUUID()}`;
    const recoveryCookies = await page.context().cookies();
    const grant = recoveryCookies.find(
      (cookie) => cookie.name === "portal-recovery",
    );
    expect(Boolean(grant?.httpOnly)).toBe(true);
    expect(
      await page.evaluate(() => document.cookie.includes("portal-recovery")),
    ).toBe(false);
    if (!grant) throw new Error("Missing local recovery grant");
    await page.context().addCookies([{ ...grant, value: "invalid-grant" }]);
    const tampered = await page.request.post(origin + "/auth/update-password", {
      headers: { Origin: origin },
      data: { password: replacement, confirmation: replacement },
    });
    expect(tampered.status()).toBe(401);
    await page.context().addCookies([grant]);
    await fillPasswords(page, replacement);
    await page.getByLabel("Confirm new password").fill("mismatched-password");
    await page
      .getByRole("button", { name: "Update password", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Passwords do not match" }),
    ).toContainText("do not match");
    await page.getByLabel("Confirm new password").fill(replacement);
    await page
      .getByRole("button", { name: "Update password", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Sign-out confirmed");
    expect(
      (await page.context().cookies()).some(
        (cookie) => cookie.name === "portal-recovery",
      ),
    ).toBe(false);
    await page.context().addCookies(recoveryCookies);
    const reusedGrant = await page.request.post(
      origin + "/auth/update-password",
      {
        headers: { Origin: origin },
        data: {
          password: "another-password-change",
          confirmation: "another-password-change",
        },
      },
    );
    expect(reusedGrant.status()).toBe(401);
    await page.context().clearCookies();
    const oldLogin = await user.publicClient.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });
    expect(Boolean(oldLogin.error)).toBe(true);
    const oldRefresh = await user.publicClient.auth.refreshSession({
      refresh_token: oldSession.data.session.refresh_token,
    });
    expect(Boolean(oldRefresh.error)).toBe(true);
    const newLogin = await user.publicClient.auth.signInWithPassword({
      email: user.email,
      password: replacement,
    });
    expect(Boolean(newLogin.data.session)).toBe(true);
    const replay = await page.request.post(origin + "/auth/verify-recovery", {
      headers: { Origin: origin },
      form: { token_hash: new URL(link).searchParams.get("token_hash")! },
      maxRedirects: 0,
    });
    expect(replay.status()).toBe(303);
    expect(replay.headers().location).toBe("/forgot-password?status=invalid");
  } finally {
    await user.cleanup();
  }
});

test("ordinary sessions and expired recovery links cannot use the reset application", async ({
  page,
}) => {
  const user = await fixture();
  try {
    await page.goto("/login");
    await page.getByLabel("Email address").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/dashboard");
    await page.goto("/reset-password");
    await expect(
      page.getByRole("alert").filter({ hasText: "Your reset link" }),
    ).toContainText("invalid or expired");
    const direct = await page.request.post(origin + "/auth/update-password", {
      headers: { Origin: origin },
      data: {
        password: "replacement-password",
        confirmation: "replacement-password",
      },
    });
    expect(direct.status()).toBe(401);
    const link = await generatedLink(user);
    if (!/^[a-f0-9-]{36}$/.test(user.id))
      throw new Error("Unexpected local fixture ID");
    const project =
      "client-portal-tests-" +
      createHash("sha256").update(process.cwd()).digest("hex").slice(0, 8);
    // Only the dedicated test container and this synthetic user are modified.
    execFileSync(
      "docker",
      [
        "exec",
        `supabase_db_${project}`,
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-c",
        `update auth.users set recovery_sent_at=now()-interval '2 hours' where id='${user.id}';`,
      ],
      { stdio: "pipe", windowsHide: true },
    );
    const expired = await page.request.post(origin + "/auth/verify-recovery", {
      headers: { Origin: origin },
      form: { token_hash: new URL(link).searchParams.get("token_hash")! },
      maxRedirects: 0,
    });
    expect(expired.status()).toBe(303);
    expect(expired.headers().location).toBe("/forgot-password?status=invalid");
    const login = await user.publicClient.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });
    expect(Boolean(login.data.session)).toBe(true);
  } finally {
    await user.cleanup();
  }
});

test("password saved with logout failure offers a separate logout retry", async ({
  page,
}) => {
  const user = await fixture();
  try {
    await verifyLink(page, await generatedLink(user));
    let updates = 0;
    let finishes = 0;
    await page.route("**/auth/update-password", async (route) => {
      updates++;
      await route.fulfill({ json: { state: "updated_logout_pending" } });
    });
    await page.route("**/auth/finish-recovery", async (route) => {
      finishes++;
      await route.fulfill({ json: { complete: true } });
    });
    await fillPasswords(page, "replacement-password");
    await page
      .getByRole("button", { name: "Update password", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "could not be confirmed",
    );
    await expect(
      page.getByRole("button", { name: "Update password", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Finish signing out" }).click();
    await expect(page.getByRole("status")).toContainText("Sign-out confirmed");
    expect(updates).toBe(1);
    expect(finishes).toBe(1);
  } finally {
    await user.cleanup();
  }
});

test("network ambiguity does not claim success or automatically repeat the password write", async ({
  page,
}) => {
  const user = await fixture();
  try {
    await verifyLink(page, await generatedLink(user));
    let writes = 0;
    await page.route("**/auth/update-password", async (route) => {
      writes++;
      await route.abort("failed");
    });
    await fillPasswords(page, "replacement-password");
    await page
      .getByRole("button", { name: "Update password", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Could not confirm whether" }),
    ).toContainText("Could not confirm whether");
    await expect(
      page.getByRole("button", { name: "Update password", exact: true }),
    ).toHaveCount(0);
    expect(writes).toBe(1);
  } finally {
    await user.cleanup();
  }
});

test("unknown email receives the same generic success message", async ({
  page,
}) => {
  clients();
  await page.goto("/forgot-password");
  await page
    .getByLabel("Email address")
    .fill(`unknown-${randomUUID()}@example.test`);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("If an account exists");
});

test("session check outage does not label the recovery link invalid", async ({
  page,
}) => {
  await page.route("**/auth/recovery-session", async (route) =>
    route.fulfill({ status: 503, json: { ready: false } }),
  );
  await page.goto("/reset-password");
  await expect(
    page.getByRole("alert").filter({ hasText: "Could not check" }),
  ).toBeVisible();
  await expect(
    page.getByText("Your reset link is invalid or expired.", { exact: false }),
  ).toHaveCount(0);
  await page.unroute("**/auth/recovery-session");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Your reset link" }),
  ).toBeVisible();
});

test("recovery request rate limit shows an error and preserves the entered email", async ({
  page,
}) => {
  clients();
  await page.route("**/auth/v1/recover**", async (route) =>
    route.fulfill({
      status: 429,
      json: { message: "Local rate limit fixture" },
    }),
  );
  await page.goto("/forgot-password");
  const email = `limited-${randomUUID()}@example.test`;
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Unable to send" }),
  ).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveValue(email);
  await expect(page.getByRole("status")).toHaveCount(0);
});
