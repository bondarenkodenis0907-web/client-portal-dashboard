import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function secretRules(text) {
  const rules = [];
  const patterns = {
    "private-key":
      /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/,
    "supabase-secret": /\bsb_secret_[A-Za-z0-9_-]{20,}\b/,
    "supabase-management-token": /\bsbp_[a-f0-9]{40,}\b/,
    "github-token":
      /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/,
    "public-privileged-variable":
      /\bNEXT_PUBLIC_[A-Z0-9_]*(?:SERVICE_ROLE|SECRET_KEY|PRIVATE_KEY|SIGNING_SECRET)[A-Z0-9_]*\b/,
  };
  for (const [rule, pattern] of Object.entries(patterns)) {
    if (pattern.test(text)) rules.push(rule);
  }
  for (const token of text.matchAll(
    /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  )) {
    try {
      const claims = JSON.parse(
        Buffer.from(token[0].split(".")[1], "base64url"),
      );
      if (claims.role === "service_role") rules.push("privileged-jwt");
    } catch {
      // A non-JWT string is not evidence of a privileged credential.
    }
  }
  for (const match of text.matchAll(/postgres(?:ql)?:\/\/[^\s"'<>`]+/g)) {
    try {
      const url = new URL(match[0]);
      if (
        url.password &&
        !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      )
        rules.push("remote-database-password");
    } catch {
      // Documentation placeholders need not be valid URLs.
    }
  }
  return [...new Set(rules)];
}

export function dependencyRules(pkg, lock, nodeVersion) {
  const rules = [];
  if (pkg.packageManager !== "npm@11.17.0" || pkg.engines?.npm !== "11.17.0")
    rules.push("package-manager-pin");
  if (nodeVersion.trim() !== "24.19.0" || pkg.engines?.node !== "24.x")
    rules.push("node-pin");
  if (lock.lockfileVersion !== 3) rules.push("lockfile-format");
  for (const section of ["dependencies", "devDependencies"]) {
    for (const [name, version] of Object.entries(pkg[section] ?? {})) {
      if (!/^\d+\.\d+\.\d+$/.test(version))
        rules.push(`unfixed-version:${name}`);
      if (
        lock.packages?.[""]?.[section]?.[name] !== version ||
        lock.packages?.[`node_modules/${name}`]?.version !== version
      )
        rules.push(`lockfile-mismatch:${name}`);
    }
  }
  for (const [name, value] of Object.entries(lock.packages ?? {})) {
    if (!name) continue;
    // Bundled packages inherit the registry tarball's integrity. Only accept
    // a package explicitly listed by its nearest non-bundled parent.
    if (value.inBundle && !value.resolved && !value.link) {
      const split = name.lastIndexOf("/node_modules/");
      const parent = lock.packages[name.slice(0, split)];
      const child = name.slice(split + "/node_modules/".length);
      if (
        split > 0 &&
        !parent?.inBundle &&
        /^https:\/\/registry\.npmjs\.org\//.test(parent?.resolved ?? "") &&
        /^sha512-[A-Za-z0-9+/]+={0,2}$/.test(parent?.integrity ?? "") &&
        parent?.bundleDependencies?.includes(child)
      )
        continue;
    }
    if (
      !/^https:\/\/registry\.npmjs\.org\//.test(value.resolved ?? "") ||
      !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(value.integrity ?? "") ||
      value.link
    )
      rules.push(`unapproved-package-source:${name}`);
  }
  return rules;
}

export function checkRepository(root) {
  const files = [
    ...new Set(
      execFileSync(
        "git",
        ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        { cwd: root, encoding: "utf8" },
      )
        .split("\0")
        .filter(Boolean),
    ),
  ];
  const findings = [];
  let scanned = 0;
  for (const file of files) {
    const path = join(root, file);
    if (!existsSync(path)) continue; // Locally deleted tracked files.
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      findings.push({ file, rule: "non-regular-release-file" });
      continue;
    }
    if (
      /(?:^|\/)(?:\.env(?:\..*)?|key\.dpapi|signing_keys\.json)$/.test(file) ||
      /(?:^|\/)(?:\.local-tests|\.local-restore|\.local-backups|\.vercel|\.netlify)\//.test(
        file,
      )
    )
      findings.push({ file, rule: "private-file-in-release" });
    const bytes = readFileSync(path);
    if (bytes.includes(0)) continue; // Binary assets are not a text-secret audit.
    scanned++;
    for (const rule of secretRules(bytes.toString("utf8")))
      findings.push({ file, rule });
  }
  const pkg = JSON.parse(readFileSync(join(root, "package.json")));
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json")));
  for (const rule of dependencyRules(
    pkg,
    lock,
    readFileSync(join(root, ".node-version"), "utf8"),
  ))
    findings.push({ file: "package.json/package-lock.json", rule });
  const workflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
  for (const use of workflow.matchAll(/^\s*uses:\s*(\S+)/gm)) {
    if (
      !/^actions\/(?:checkout|setup-node|upload-artifact)@[a-f0-9]{40}$/.test(
        use[1],
      )
    )
      findings.push({
        file: ".github/workflows/ci.yml",
        rule: "unreviewed-action-reference",
      });
  }
  if (
    !/permissions:\s*\n\s+contents: read\s*\n/.test(workflow) ||
    /pull_request_target|secrets\s*[.[]|(?:contents|packages|id-token):\s*write|\b(?:vercel deploy|supabase db push)\b/.test(
      workflow,
    )
  )
    findings.push({
      file: ".github/workflows/ci.yml",
      rule: "unsafe-ci-authority",
    });
  if (
    !workflow.includes("npm run check:security") ||
    !workflow.includes("  release-gates:")
  )
    findings.push({
      file: ".github/workflows/ci.yml",
      rule: "missing-security-gate",
    });
  return { scannedTextFiles: scanned, findings };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const report = checkRepository(root);
  if (process.version !== "v24.19.0")
    report.findings.push({
      file: ".node-version",
      rule: "runtime-node-mismatch",
    });
  if (process.env.npm_config_user_agent?.split(" ")[0] !== "npm/11.17.0")
    report.findings.push({
      file: "package.json",
      rule: "runtime-npm-mismatch",
    });
  // Never print matched values, JWT claims or surrounding source text.
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.findings.length ? 1 : 0;
}
