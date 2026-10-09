# Dependency security maintenance

Checked on 2026-10-09 against the official npm bulk advisory service.

## Remaining advisory

The lockfile still includes development-only `braces@3.0.3` through tooling that uses micromatch. [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) affects all currently published versions; the advisory lists no patched release. Do not claim a clean audit or invent a patched version.

The described failure requires an attacker-controlled, deeply nested brace pattern to reach the parser. No such request input was identified in the reviewed application code. Keep this residual risk visible, monitor the upstream fix, and avoid running build/lint tooling on untrusted input with sensitive credentials. This is an applicability assessment, not a waiver of the high severity advisory.

Re-run the dependency audit after every lockfile update and remove temporary overrides when parent packages adopt fixed versions. Installing with `npm ci` must reproduce the committed lockfile; do not use `npm audit fix --force` as a substitute for compatibility testing.

The update reduces matched advisory records from 8 to 1. Next.js and eslint-config-next are pinned together at 16.3.8. Supabase packages are pinned explicitly, and CI now builds the production bundle using placeholder public configuration without contacting a production database.
