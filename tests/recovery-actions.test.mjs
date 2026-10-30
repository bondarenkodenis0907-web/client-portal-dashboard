import assert from "node:assert/strict";
import test from "node:test";
import { changeRecoveryPassword } from "../src/lib/recovery-actions.ts";

test("confirmed update is followed by global signout before success", async () => {
  const calls = [];
  const auth = {
    getSession: async () => ({
      data: { session: { access_token: "fixture" } },
      error: null,
    }),
    admin: {
      signOut: async (_jwt, scope) => {
        calls.push(scope);
        return { error: null };
      },
    },
    updateUser: async () => {
      calls.push("update");
      return { error: null };
    },
    signOut: async (options) => {
      calls.push(options.scope);
      return { error: null };
    },
  };
  assert.equal(
    await changeRecoveryPassword(auth, "fixture-password"),
    "complete",
  );
  assert.deepEqual(calls, ["update", "global", "local"]);
});
test("failed or ambiguous updates never report success or trigger logout", async () => {
  let logout = 0;
  const auth = {
    updateUser: async () => ({ error: new Error("fixture") }),
    signOut: async () => {
      logout++;
      return { error: null };
    },
  };
  assert.equal(await changeRecoveryPassword(auth, "fixture"), "update_failed");
  auth.updateUser = async () => {
    throw new Error("connection lost");
  };
  assert.equal(await changeRecoveryPassword(auth, "fixture"), "unknown");
  assert.equal(logout, 0);
});
test("returned and thrown logout errors preserve the confirmed password update", async () => {
  const auth = {
    getSession: async () => ({
      data: { session: { access_token: "fixture" } },
      error: null,
    }),
    admin: { signOut: async () => ({ error: new Error("fixture") }) },
    updateUser: async () => ({ error: null }),
    signOut: async () => ({ error: new Error("fixture") }),
  };
  assert.equal(
    await changeRecoveryPassword(auth, "fixture"),
    "updated_logout_pending",
  );
  auth.admin.signOut = async () => {
    throw new Error("connection lost");
  };
  assert.equal(
    await changeRecoveryPassword(auth, "fixture"),
    "updated_logout_pending",
  );
});
