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
  { timeout: 90000 },
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
          for (const code of [401, 403]) {
            writeFileSync(marker, String(code));
            const rejected = await context.request.get(origin + path, {
              maxRedirects: 0,
            });
            assert.equal(rejected.status(), 307);
            assert.equal(rejected.headers().location, "/login");
          }
          rmSync(marker);
        } finally {
          await context.close();
        }
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
