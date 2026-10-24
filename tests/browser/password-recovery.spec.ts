import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

test("recovery routes reject missing or invalid links", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await expect(
    page.getByRole("heading", { name: "Reset your password" }),
  ).toBeVisible();
  const fitsViewport = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(fitsViewport).toBe(true);

  await page.goto("/reset-password");
  await expect(
    page.getByRole("alert").filter({ hasText: "Your reset link" }),
  ).toContainText("invalid or expired");

  await page.goto("/auth/callback?next=https://example.test");
  await expect(page).toHaveURL(/\/forgot-password\?status=invalid$/);
  await page.goto("/auth/confirm");
  await expect(
    page.getByRole("alert").filter({ hasText: "This reset link" }),
  ).toContainText("invalid");
});

test("local recovery email opens a one-time link and changes the password", async ({
  page,
}) => {
  const api = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const backend = new URL(api);
  if (!["127.0.0.1", "localhost"].includes(backend.hostname))
    throw new Error("Password recovery tests require local Supabase.");

  const admin = createClient(api, process.env.TEST_SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  });
  const email = "recovery-" + randomUUID() + "@example.test";
  const original = "old-" + randomUUID();
  const replacement = "new-" + randomUUID();
  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password: original,
      email_confirm: true,
    });
  if (createError || !created.user) throw createError ?? new Error("No user");

  try {
    await page.goto("/forgot-password");
    await page.getByLabel("Email address").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toContainText(
      "If an account exists for this email",
    );

    // The Supabase CLI currently uses Mailpit, not the retired Inbucket API.
    const mailpit = "http://127.0.0.1:55324";
    const searchUrl =
      mailpit +
      "/api/v1/search?query=" +
      encodeURIComponent("to:" + email) +
      "&limit=1";

    await expect
      .poll(
        async () => {
          const response = await fetch(searchUrl);
          if (!response.ok) throw new Error("Local Mailpit unavailable");
          const results = (await response.json()) as {
            messages?: Array<{ ID: string }>;
          };
          return results.messages?.length ?? 0;
        },
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);

    const results = (await (await fetch(searchUrl)).json()) as {
      messages: Array<{ ID: string }>;
    };
    const detailUrl =
      mailpit + "/api/v1/message/" + encodeURIComponent(results.messages[0].ID);
    const message = (await (await fetch(detailUrl)).json()) as {
      Text?: string;
      HTML?: string;
    };
    const body = message.HTML || message.Text || "";
    const links = [...body.matchAll(/https?:\/\/[^\s<>"']+/g)].map((match) =>
      match[0].replaceAll("&amp;", "&"),
    );
    const action = links.find((link) => {
      try {
        const url = new URL(link);
        return (
          ["127.0.0.1", "localhost"].includes(url.hostname) &&
          url.pathname === "/auth/callback" &&
          url.searchParams.has("token_hash") &&
          url.searchParams.get("type") === "recovery"
        );
      } catch {
        return false;
      }
    });
    if (!action) throw new Error("Local reset email contains no recovery link");

    const expectedHost = new URL(action).hostname;

    // Simulate a mail-security scanner following GET links. Neither GET
    // may verify the token or create an authenticated browser session.
    const scanned = await page.request.get(action, { maxRedirects: 0 });
    expect(scanned.status()).toBe(303);
    const safeLanding = scanned.headers()["location"];
    expect(safeLanding).toMatch(/^\/auth\/confirm\?token_hash=/);
    const landing = await page.request.get(
      new URL(safeLanding, new URL(action).origin).toString(),
    );
    expect(landing.status()).toBe(200);
    expect(landing.headers()["cache-control"]).toContain("no-store");
    expect(landing.headers()["referrer-policy"]).toBe("no-referrer");

    await page.goto(action);
    await expect.poll(() => new URL(page.url()).pathname).toBe("/auth/confirm");
    expect(new URL(page.url()).hostname).toBe(expectedHost);
    await expect(
      page.getByRole("button", { name: "Continue password reset" }),
    ).toBeVisible();
    // GET must only show the confirmation screen, never the password form.
    await expect(page.getByLabel("New password", { exact: true })).toHaveCount(
      0,
    );

    // Multiple GETs and reloads must not consume the reset link.
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Continue password reset" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Continue password reset" }).click();
    await expect(page).toHaveURL(/\/reset-password$/);
    expect(new URL(page.url()).hostname).toBe(expectedHost);

    const canReadSessionCookie = await page.evaluate(() =>
      document.cookie.includes("-auth-token"),
    );
    expect(canReadSessionCookie).toBe(true);

    await expect(
      page.getByLabel("New password", { exact: true }),
    ).toBeVisible();

    await page.getByLabel("New password", { exact: true }).fill(replacement);
    await page.getByLabel("Confirm new password").fill("different-value");
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Passwords do not match" }),
    ).toBeVisible();

    await page.getByLabel("Confirm new password").fill(replacement);
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.getByRole("status")).toContainText("Password updated");

    await page.getByRole("link", { name: "Return to sign in" }).click();
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(replacement);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    // The GET confirmation page remains safe after consumption, but a
    // subsequent POST must reject the already-used token.
    await page.goto(action);
    await expect.poll(() => new URL(page.url()).pathname).toBe("/auth/confirm");
    await page.getByRole("button", { name: "Continue password reset" }).click();
    await expect(page).toHaveURL(/\/forgot-password\?status=invalid$/);
  } finally {
    await admin.auth.admin.deleteUser(created.user.id);
  }
});
