import assert from "node:assert/strict";
import test from "node:test";
import { classifyHostResponse } from "../scripts/probe-preview-hosts.mjs";

test("404 is accepted only for recorded retirement and the Netlify retirement page", () => {
  assert.equal(
    classifyHostResponse(
      "client-portal-dashboard.netlify.app",
      404,
      "",
      "Site not found",
    ),
    "retired",
  );
  assert.equal(
    classifyHostResponse(
      "client-portal-dashboard.netlify.app",
      404,
      "",
      "Unrelated missing route",
    ),
    "unverified",
  );
  assert.equal(
    classifyHostResponse("unknown.netlify.app", 404, "", "Site not found"),
    "unverified",
  );
  assert.equal(
    classifyHostResponse(
      "client-portal-dashboard.netlify.app",
      200,
      "",
      "Site not found",
    ),
    "unverified",
  );
});

test("active Vercel hosts need recognized protection, never an arbitrary 404 or redirect", () => {
  const host =
    "client-portal-dashboard-git-chor-c3c9a6-bondarenkodenis0907-web.vercel.app";
  assert.equal(
    classifyHostResponse(host, 404, "", "Site not found"),
    "unverified",
  );
  assert.equal(
    classifyHostResponse(host, 302, "https://vercel.com/sso-api?next=example"),
    "restricted",
  );
  assert.equal(
    classifyHostResponse(host, 302, "https://vercel.com.evil.test/sso-api"),
    "unverified",
  );
  assert.equal(classifyHostResponse(host, 503), "restricted");
  assert.equal(classifyHostResponse(host, 200), "unverified");
});
