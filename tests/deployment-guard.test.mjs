import assert from "node:assert/strict";
import test from "node:test";
import { isDeploymentAllowed } from "../src/lib/deployment-guard.ts";

const production = {
  VERCEL: "1",
  VERCEL_ENV: "production",
  NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: "https://xdpewqewdeiaoyotpawv.supabase.co",
};
const local = {
  NODE_ENV: "production",
  CLIENT_PORTAL_LOCAL_TESTS: "1",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:56321",
};

test("only the known Vercel production host and backend are approved", () => {
  assert.equal(
    isDeploymentAllowed("client-portal-dashboard-one.vercel.app", production),
    true,
  );
  for (const host of [
    "other.vercel.app",
    "localhost",
    "127.0.0.1",
    "example.test",
    "client-portal-dashboard.netlify.app",
  ]) {
    assert.equal(isDeploymentAllowed(host, production), false, host);
  }
  assert.equal(
    isDeploymentAllowed("client-portal-dashboard-one.vercel.app", {
      ...production,
      VERCEL: undefined,
    }),
    false,
  );
  assert.equal(
    isDeploymentAllowed("client-portal-dashboard-one.vercel.app", {
      ...production,
      NEXT_PUBLIC_SUPABASE_URL: "https://another.supabase.co",
    }),
    false,
  );
});

test("cloud flags and Netlify hosts override the local test bypass", () => {
  for (const flags of [
    { VERCEL: "1" },
    { VERCEL_ENV: "preview" },
    { VERCEL_ENV: "development" },
    { NETLIFY: "true" },
    { CONTEXT: "production" },
    { CONTEXT: "branch-deploy" },
  ]) {
    assert.equal(
      isDeploymentAllowed("127.0.0.1", { ...local, ...flags }),
      false,
    );
  }
  for (const host of [
    "example.test",
    "preview.vercel.app",
    "test.netlify.app",
    "127.0.0.1.example.test",
  ]) {
    assert.equal(isDeploymentAllowed(host, local), false);
  }
  assert.equal(
    isDeploymentAllowed("client-portal-dashboard-one.vercel.app", {
      ...production,
      NETLIFY: "true",
    }),
    false,
  );
});

test("local tests require the dedicated backend and explicit flag", () => {
  assert.equal(isDeploymentAllowed("127.0.0.1", local), true);
  assert.equal(isDeploymentAllowed("localhost", local), true);
  assert.equal(
    isDeploymentAllowed("127.0.0.1", {
      ...local,
      CLIENT_PORTAL_LOCAL_TESTS: undefined,
    }),
    false,
  );
  for (const url of [
    production.NEXT_PUBLIC_SUPABASE_URL,
    "http://127.0.0.1:55321",
    "http://127.0.0.1:56321/rest/v1",
    "http://user:pass@127.0.0.1:56321",
    "http://127.0.0.1:56321?x=1",
    "invalid",
    "",
  ]) {
    assert.equal(
      isDeploymentAllowed("127.0.0.1", {
        ...local,
        NEXT_PUBLIC_SUPABASE_URL: url,
      }),
      false,
    );
  }
});

test("development remains loopback-only and cannot use hosted Supabase", () => {
  const dev = {
    NODE_ENV: "development",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55321",
  };
  assert.equal(isDeploymentAllowed("localhost", dev), true);
  assert.equal(isDeploymentAllowed("public.example.test", dev), false);
  assert.equal(
    isDeploymentAllowed("localhost", {
      ...dev,
      NEXT_PUBLIC_SUPABASE_URL: production.NEXT_PUBLIC_SUPABASE_URL,
    }),
    false,
  );
  assert.equal(
    isDeploymentAllowed("localhost", { ...dev, VERCEL_ENV: "preview" }),
    false,
  );
});
