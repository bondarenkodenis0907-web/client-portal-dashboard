import assert from "node:assert/strict";
import test from "node:test";
import { dependencyRules, secretRules } from "../scripts/security-gates.mjs";

test("detects privileged credentials without returning their contents", () => {
  const secret = "sb_" + "secret_" + "x".repeat(35);
  const jwt =
    [{ alg: "HS256" }, { role: "service_role" }]
      .map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"))
      .join(".") + ".fake";
  const input = [
    secret,
    jwt,
    "-----BEGIN " + "PRIVATE KEY-----",
    "ghp_" + "x".repeat(36),
  ].join("\n");
  const found = secretRules(input);
  assert.deepEqual(
    found.sort(),
    ["supabase-secret", "privileged-jwt", "private-key", "github-token"].sort(),
  );
  assert.ok(!JSON.stringify(found).includes(secret));
  assert.ok(!JSON.stringify(found).includes(jwt));
});

test("rejects hosted database passwords and public privileged variable names", () => {
  assert.deepEqual(
    secretRules("postgresql://person:" + "synthetic@remote.example/db"),
    ["remote-database-password"],
  );
  assert.deepEqual(secretRules("NEXT_PUBLIC_" + "SUPABASE_SERVICE_ROLE_KEY"), [
    "public-privileged-variable",
  ]);
  assert.deepEqual(
    secretRules(
      "postgresql://postgres:postgres@127.0.0.1:56322/postgres sb_publishable_placeholder",
    ),
    [],
  );
});

test("dependency source policy rejects mutable versions, registry lookalikes and missing integrity", () => {
  const p = {
    packageManager: "npm@11.17.0",
    engines: { node: "24.x", npm: "11.17.0" },
    dependencies: { demo: "1.2.3" },
  };
  const l = {
    lockfileVersion: 3,
    packages: {
      "": { dependencies: { demo: "1.2.3" } },
      "node_modules/demo": {
        version: "1.2.3",
        resolved: "https://registry.npmjs.org/demo/-/demo-1.2.3.tgz",
        integrity: "sha512-YWJj",
      },
    },
  };
  assert.deepEqual(dependencyRules(p, l, "24.19.0\n"), []);
  p.dependencies.demo = "^1.2.3";
  l.packages["node_modules/demo"].resolved =
    "https://registry.npmjs.org.attacker.example/demo.tgz";
  delete l.packages["node_modules/demo"].integrity;
  const rules = dependencyRules(p, l, "24.19.0");
  assert.ok(rules.includes("unfixed-version:demo"));
  assert.ok(rules.includes("lockfile-mismatch:demo"));
  assert.ok(rules.includes("unapproved-package-source:node_modules/demo"));
});
