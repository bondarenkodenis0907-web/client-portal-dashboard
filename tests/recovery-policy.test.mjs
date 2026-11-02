import assert from "node:assert/strict";
import test from "node:test";
import {
  boundedBody,
  sameOriginPost,
  validPassword,
  validTokenHash,
} from "../src/lib/recovery-policy.ts";

test("recovery POST requires an explicit matching Origin, rejects cross-site metadata", () => {
  const request = (headers) =>
    new Request("http://127.0.0.1:3010/auth/verify-recovery", {
      method: "POST",
      headers,
    });
  for (const origin of [
    undefined,
    "null",
    "http://localhost:3010",
    "https://evil.test",
    "http://127.0.0.1:3010.evil.test",
  ]) {
    assert.equal(sameOriginPost(request(origin ? { origin } : {})), false);
  }
  assert.equal(
    sameOriginPost(request({ origin: "http://127.0.0.1:3010" })),
    true,
  );
  assert.equal(
    sameOriginPost(
      request({
        origin: "http://127.0.0.1:3010",
        "sec-fetch-site": "cross-site",
      }),
    ),
    false,
  );
});
test("loopback normalization uses the exact Host authority without trusting forwarded hosts", () => {
  const request = (headers) =>
    new Request("http://localhost:3010/auth/verify-recovery", {
      method: "POST",
      headers,
    });
  assert.equal(
    sameOriginPost(
      request({ Host: "127.0.0.1:3010", Origin: "http://127.0.0.1:3010" }),
    ),
    true,
  );
  assert.equal(
    sameOriginPost(
      request({ Host: "127.0.0.1:3010", Origin: "http://localhost:3010" }),
    ),
    false,
  );
  assert.equal(
    sameOriginPost(request({ Host: "evil.test", Origin: "http://evil.test" })),
    false,
  );
  assert.equal(
    sameOriginPost(
      request({
        Host: "127.0.0.1:3010",
        Origin: "http://evil.test",
        "X-Forwarded-Host": "evil.test",
      }),
    ),
    false,
  );
});
test("tokens and passwords are bounded and confirmation must match", () => {
  assert.equal(validTokenHash("a".repeat(64)), true);
  for (const token of [
    null,
    [],
    "short",
    "a".repeat(513),
    "<script>",
    "a".repeat(30) + "\n",
  ])
    assert.equal(validTokenHash(token), false);
  assert.equal(validPassword("long-test-password", "long-test-password"), true);
  assert.equal(validPassword("long-test-password", "different"), false);
  assert.equal(validPassword("short", "short"), false);
  assert.equal(validPassword("a".repeat(73), "a".repeat(73)), false);
  assert.equal(validPassword("😀".repeat(20), "😀".repeat(20)), false);
});
test("body size limit applies even when Content-Length is absent", async () => {
  const small = new Request("http://localhost", { method: "POST", body: "ok" });
  assert.equal(await boundedBody(small), "ok");
  const large = new Request("http://localhost", {
    method: "POST",
    body: "x".repeat(4097),
  });
  await assert.rejects(boundedBody(large));
});
