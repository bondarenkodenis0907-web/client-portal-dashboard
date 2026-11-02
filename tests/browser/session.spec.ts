import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createClient, type Session } from "@supabase/supabase-js";

test("Proxy redirects guests, refreshes cookies, signs out and clears rejected sessions", async ({
  browser,
}) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (url !== "http://127.0.0.1:56321")
    throw new Error("Use the dedicated local backend.");
  const admin = createClient(url, process.env.TEST_SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const publicClient = createClient(
    url,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const email = `session-${randomUUID()}@example.test`;
  const password = randomUUID();
  const context = await browser.newContext();
  const page = await context.newPage();
  const cookieName = "sb-127-auth-token";
  let userId: string | undefined;
  async function expiredCookie(
    session: Session,
    refreshToken = session.refresh_token,
  ) {
    const [header, body, signature] = session.access_token.split(".");
    const claims = JSON.parse(Buffer.from(body, "base64url").toString());
    const accessToken = [
      header,
      Buffer.from(JSON.stringify({ ...claims, exp: 1 })).toString("base64url"),
      signature,
    ].join(".");
    const value =
      "base64-" +
      Buffer.from(
        JSON.stringify({
          ...session,
          access_token: accessToken,
          expires_at: 1,
          refresh_token: refreshToken,
        }),
      ).toString("base64url");
    await context.clearCookies({ name: new RegExp(`^${cookieName}`) });
    await context.addCookies([
      {
        name: cookieName,
        value,
        url: "http://127.0.0.1:3010",
        sameSite: "Lax",
      },
    ]);
    return accessToken;
  }
  try {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error || !created.data.user)
      throw new Error("Could not create local session fixture.");
    userId = created.data.user.id;
    await page.goto("/dashboard/requests");
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTitle(email)).toBeVisible();

    const signedIn = await publicClient.auth.signInWithPassword({
      email,
      password,
    });
    if (signedIn.error || !signedIn.data.session)
      throw new Error("Could not create local refresh fixture.");
    const session = signedIn.data.session;
    const expired = await expiredCookie(session);
    const refreshedResponse = await page.goto("/dashboard/requests");
    await expect(page).toHaveURL(/\/dashboard\/requests$/);
    expect(await refreshedResponse?.headerValue("cache-control")).toContain(
      "no-store",
    );
    expect(
      Boolean(await refreshedResponse?.headerValue("set-cookie")),
    ).toBeTruthy();
    const cookies = (await context.cookies())
      .filter(
        (cookie) =>
          cookie.name === cookieName ||
          cookie.name.startsWith(cookieName + "."),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
    const value = cookies.map((cookie) => cookie.value).join("");
    const refreshed = JSON.parse(
      Buffer.from(value.slice("base64-".length), "base64url").toString(),
    );
    expect(refreshed.access_token !== expired).toBeTruthy();
    expect(refreshed.expires_at > Date.now() / 1000).toBeTruthy();

    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);

    await expiredCookie(session, "rejected-local-refresh-token");
    const denied = await context.request.get(
      "http://127.0.0.1:3010/dashboard",
      { maxRedirects: 0 },
    );
    expect(denied.status()).toBe(307);
    expect(denied.headers()["location"]).toMatch(/\/login$/);
    expect(denied.headers()["cache-control"]).toContain("no-store");
    expect(denied.headers()["set-cookie"]).toContain("Max-Age=0");
    const remaining = (await context.cookies()).filter(
      (cookie) =>
        cookie.name === cookieName || cookie.name.startsWith(cookieName + "."),
    );
    expect(remaining.length).toBe(0);
  } finally {
    await context.close();
    if (userId) {
      const removed = await admin.auth.admin.deleteUser(userId);
      if (removed.error)
        throw new Error("Local session fixture cleanup failed.");
    }
  }
});
