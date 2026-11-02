import assert from "node:assert/strict";
import test from "node:test";
import {
  issueRecoveryGrant,
  verifyRecoveryGrant,
} from "../src/lib/recovery-grant.ts";
const secret = "local-unit-test-signing-placeholder-32-bytes";
const identity = {
  sub: "user-a",
  session_id: "session-a",
  userVersion: "version-a",
};
test("recovery grants are signed, time-limited and bound to identity and session", () => {
  const grant = issueRecoveryGrant(identity, secret, 1000);
  assert.equal(verifyRecoveryGrant(grant, identity, secret, 1500), true);
  assert.equal(verifyRecoveryGrant(grant, identity, secret, 1601), false);
  assert.equal(verifyRecoveryGrant(grant, identity, secret, 969), false);
  assert.equal(
    verifyRecoveryGrant(grant, { ...identity, sub: "user-b" }, secret, 1001),
    false,
  );
  assert.equal(
    verifyRecoveryGrant(
      grant,
      { ...identity, session_id: "session-b" },
      secret,
      1001,
    ),
    false,
  );
});
test("password/account version changes and tampering invalidate the recovery grant", () => {
  const grant = issueRecoveryGrant(identity, secret, 1000);
  assert.equal(
    verifyRecoveryGrant(
      grant,
      { ...identity, userVersion: "password-updated" },
      secret,
      1001,
    ),
    false,
  );
  assert.equal(verifyRecoveryGrant("x" + grant, identity, secret, 1001), false);
  assert.equal(
    verifyRecoveryGrant(grant, identity, secret + "other", 1001),
    false,
  );
  assert.equal(verifyRecoveryGrant(undefined, identity, secret, 1001), false);
  assert.equal(
    verifyRecoveryGrant("x".repeat(2049), identity, secret, 1001),
    false,
  );
});
test("missing signing configuration fails closed", () => {
  assert.throws(() => issueRecoveryGrant(identity, "short"));
  assert.equal(verifyRecoveryGrant("any", identity, "short"), false);
});
