import test from "node:test";
import assert from "node:assert/strict";
import { isTransientAuthError } from "../src/lib/auth-errors.ts";
test("infrastructure errors do not become missing sessions; explicit rejections still require login", () => {
  for (const error of [
    { status: 503 },
    { status: 500 },
    { name: "AuthRetryableFetchError" },
  ])
    assert.equal(isTransientAuthError(error), true);
  for (const error of [
    null,
    { status: 401 },
    { status: 403 },
    { name: "AuthSessionMissingError" },
  ])
    assert.equal(isTransientAuthError(error), false);
});
