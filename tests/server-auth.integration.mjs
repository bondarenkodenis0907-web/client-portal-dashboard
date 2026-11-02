import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";
import { runLocal, cleanEnvironment } from "../scripts/local-tests.mjs";

test(
  "SSR Auth failures remain retryable; recovery grants survive outages and reject invalid sessions",
  { timeout: 120000 },
  async () => {
    const status = await runLocal("verify");
    const directory = mkdtempSync(
      join(process.cwd(), ".local-tests/auth-fault-"),
    );
    const marker = join(directory, "status");
    const env = {
      ...cleanEnvironment(process.env),
      NODE_ENV: "production",
      TZ: "UTC",
      CLIENT_PORTAL_LOCAL_TESTS: "1",
      NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
      RECOVERY_SIGNING_SECRET: randomUUID() + randomUUID(),
      TEST_AUTH_FAULT_FILE: marker,
    };
    const admin = createClient(status.API_URL, status.SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const users = [];
    const directorySite = randomUUID();
    const directoryName = "Private server directory fixture";
    const origin = "http://127.0.0.1:3012";
    let server, browser;
    try {
      server = spawn(
        process.execPath,
        [
          "--import",
          pathToFileURL(join(process.cwd(), "tests/fixtures/auth-fault.mjs"))
            .href,
          join(process.cwd(), "node_modules/next/dist/bin/next"),
          "start",
          "--hostname",
          "127.0.0.1",
          "--port",
          "3012",
        ],
        { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
      );
      server.stdout.resume();
      server.stderr.resume();
      let ready = false;
      for (let i = 0; i < 100; i++) {
        if (server.exitCode !== null) throw Error("Integration server exited");
        try {
          if (
            (
              await fetch(origin + "/login", {
                signal: AbortSignal.timeout(1000),
              })
            ).ok
          ) {
            ready = true;
            break;
          }
        } catch {}
        await delay(100);
      }
      assert(ready, "Integration server did not start");
      for (let i = 0; i < 2; i++) {
        const email = `server-auth-${randomUUID()}@example.test`,
          password = randomUUID();
        const r = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        assert.equal(r.error, null);
        users.push({ ...r.data.user, password });
      }
      assert.equal(
        (
          await admin.from("service_staff").insert({
            user_id: users[1].id,
            display_name: "Server Auth fixture",
          })
        ).error,
        null,
      );
      const made = await admin
        .from("service_requests")
        .insert({
          user_id: users[0].id,
          operation_key: randomUUID(),
          site: "Auth retry",
          system: "CCTV",
          description: "Server Auth regression",
        })
        .select("id")
        .single();
      assert.equal(made.error, null);
      assert.equal(
        (
          await admin
            .from("sites")
            .insert({ id: directorySite, name: directoryName })
        ).error,
        null,
      );
      assert.equal(
        (
          await admin
            .from("site_memberships")
            .insert({ site_id: directorySite, user_id: users[0].id })
        ).error,
        null,
      );
      const channel =
        process.env.PLAYWRIGHT_CHANNEL ||
        (process.platform === "win32" &&
        existsSync(
          "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
        )
          ? "msedge"
          : undefined);
      browser = await chromium.launch({ channel });
      for (const [i, path, heading] of [
        [0, `/dashboard/requests/${made.data.id}`, "Auth retry"],
        [1, "/dashboard/staff", "Service queue"],
        [0, "/dashboard/sites", "Sites"],
      ]) {
        const context = await browser.newContext();
        const page = await context.newPage();
        try {
          await page.goto(origin + "/login");
          await page.getByLabel("Email address").fill(users[i].email);
          await page
            .getByLabel("Password", { exact: true })
            .fill(users[i].password);
          await page
            .getByRole("button", { name: "Sign in", exact: true })
            .click();
          await page.waitForURL("**/dashboard");
          writeFileSync(marker, "503");
          await page.goto(origin + path);
          assert.equal(new URL(page.url()).pathname, path);
          await expect(
            page.getByRole("heading", { name: "Unable to load this page" }),
          ).toBeVisible();
          rmSync(marker);
          await page
            .getByRole("button", { name: "Try again", exact: true })
            .click();
          await expect(
            page.getByRole("heading", { name: heading, exact: true }),
          ).toBeVisible();
          if (path === "/dashboard/sites") {
            await expect(
              page.getByText(directoryName, { exact: true }),
            ).toBeVisible();
            writeFileSync(marker, "sites:503");
            await page.reload();
            await expect(
              page.getByRole("heading", { name: "Unable to load this page" }),
            ).toBeVisible();
            await expect(
              page.getByRole("heading", { name: "No sites available" }),
            ).toHaveCount(0);
            rmSync(marker);
            await page
              .getByRole("button", { name: "Try again", exact: true })
              .click();
            await expect(
              page.getByRole("heading", { name: "Sites", exact: true }),
            ).toBeVisible();
          }
          for (const code of [401, 403]) {
            writeFileSync(marker, String(code));
            const rejected = await context.request.get(origin + path, {
              maxRedirects: 0,
            });
            if (path === "/dashboard/sites") {
              // A loading boundary may already have sent 200 before a server
              // redirect is emitted in the stream. Check access, not just status.
              assert([200, 307].includes(rejected.status()));
              assert(
                !(await rejected.text()).includes(directoryName),
                "Rejected stream must contain no private directory data",
              );
              await page.goto(origin + path);
              await expect(page).toHaveURL(origin + "/login");
              await expect(
                page.getByText(directoryName, { exact: true }),
              ).toHaveCount(0);
            } else {
              assert.equal(rejected.status(), 307);
              assert.equal(rejected.headers().location, "/login");
            }
          }
          rmSync(marker);
        } finally {
          await context.close();
        }
      }
      // An expired access token with a valid refresh credential must survive
      // an outage of the token endpoint, not become a rejected login session.
      const refreshContext = await browser.newContext();
      try {
        const api = createClient(status.API_URL, status.PUBLISHABLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const login = await api.auth.signInWithPassword({
          email: users[0].email,
          password: users[0].password,
        });
        assert.ok(
          !login.error && login.data.session,
          "Local refresh fixture failed",
        );
        const session = login.data.session;
        const [header, body, signature] = session.access_token.split(".");
        const claims = JSON.parse(Buffer.from(body, "base64url").toString());
        const expired = [
          header,
          Buffer.from(JSON.stringify({ ...claims, exp: 1 })).toString(
            "base64url",
          ),
          signature,
        ].join(".");
        const value =
          "base64-" +
          Buffer.from(
            JSON.stringify({
              ...session,
              access_token: expired,
              expires_at: 1,
            }),
          ).toString("base64url");
        await refreshContext.addCookies([
          { name: "sb-127-auth-token", value, url: origin, sameSite: "Lax" },
        ]);
        writeFileSync(marker, "refresh:503");
        const unavailable = await refreshContext.request.get(
          origin + "/dashboard/requests",
          { maxRedirects: 0, timeout: 60000 },
        );
        assert.equal(unavailable.status(), 503);
        assert.equal(unavailable.headers().location, undefined);
        assert.match(
          unavailable.headers()["cache-control"],
          /private.*no-store/,
        );
        assert.equal(unavailable.headers()["retry-after"], "5");
        assert.ok(
          !(unavailable.headers()["set-cookie"] ?? "").includes("Max-Age=0"),
          "A temporary refresh failure must not clear the session",
        );
        const retained = (await refreshContext.cookies()).find(
          (cookie) => cookie.name === "sb-127-auth-token",
        );
        assert.ok(
          retained?.value === value,
          "Expired session must remain retryable",
        );
        rmSync(marker);
        const recovered = await refreshContext.request.get(
          origin + "/dashboard/requests",
          { maxRedirects: 0 },
        );
        assert.equal(recovered.status(), 200);
        assert.equal(recovered.headers().location, undefined);
        const rotated = (await refreshContext.cookies())
          .filter((cookie) => /^sb-127-auth-token(?:\.\d+)?$/.test(cookie.name))
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((cookie) => cookie.value)
          .join("");
        const restored = JSON.parse(
          Buffer.from(rotated.slice("base64-".length), "base64url").toString(),
        );
        assert.ok(
          restored.access_token !== expired,
          "Refresh must issue a new access token",
        );
        assert.ok(
          restored.expires_at > Date.now() / 1000,
          "Refreshed token must be current",
        );
      } finally {
        rmSync(marker, { force: true });
        await refreshContext.close();
      }
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        const guest = await context.request.get(origin + "/dashboard/staff", {
          maxRedirects: 0,
        });
        assert.equal(guest.status(), 307);
        assert.deepEqual(
          await (
            await context.request.get(origin + "/auth/recovery-session")
          ).json(),
          { ready: false },
        );
        const link = await admin.auth.admin.generateLink({
          type: "recovery",
          email: users[0].email,
        });
        assert.equal(link.error, null);
        await page.goto(
          origin +
            "/auth/callback?type=recovery&token_hash=" +
            encodeURIComponent(link.data.properties.hashed_token),
        );
        await page
          .getByRole("button", { name: "Continue password reset" })
          .click();
        await expect(
          page.getByLabel("New password", { exact: true }),
        ).toBeVisible();
        writeFileSync(marker, "503");
        const unavailable = await context.request.get(
          origin + "/auth/recovery-session",
        );
        assert.equal(unavailable.status(), 503);
        const update = await context.request.post(
          origin + "/auth/update-password",
          {
            headers: { Origin: origin },
            data: {
              password: "local-outage-password",
              confirmation: "local-outage-password",
            },
          },
        );
        assert.equal(update.status(), 503);
        assert.deepEqual(await update.json(), { state: "unknown" });
        await page.reload();
        await expect(
          page
            .getByRole("alert")
            .filter({ hasText: "Could not check your reset link" }),
        ).toBeVisible();
        await expect(
          page.getByText("Your reset link is invalid or expired.", {
            exact: false,
          }),
        ).toHaveCount(0);
        rmSync(marker);
        await page
          .getByRole("button", { name: "Try again", exact: true })
          .click();
        await expect(
          page.getByLabel("New password", { exact: true }),
        ).toBeVisible();
        assert.deepEqual(
          await (
            await context.request.get(origin + "/auth/recovery-session")
          ).json(),
          { ready: true },
        );
        for (const code of [401, 403]) {
          writeFileSync(marker, String(code));
          const rejected = await context.request.get(
            origin + "/auth/recovery-session",
          );
          assert.equal(rejected.status(), 200);
          assert.deepEqual(await rejected.json(), { ready: false });
        }
        rmSync(marker);
      } finally {
        await context.close();
      }
    } finally {
      rmSync(marker, { force: true });
      await browser?.close();
      if (server && server.exitCode === null) {
        const closed = new Promise((r) => server.once("close", r));
        server.kill();
        await Promise.race([
          closed,
          delay(5000).then(() => {
            throw Error("Integration server did not stop");
          }),
        ]);
      }
      assert.equal(
        (
          await admin
            .from("site_memberships")
            .delete()
            .eq("site_id", directorySite)
        ).error,
        null,
      );
      assert.equal(
        (await admin.from("sites").delete().eq("id", directorySite)).error,
        null,
      );
      for (const user of users)
        assert.equal(
          (await admin.auth.admin.deleteUser(user.id)).error,
          null,
          "Synthetic fixture cleanup failed",
        );
      rmSync(directory, { recursive: true });
    }
  },
);
