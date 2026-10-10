# Dependency security maintenance

The lockfile was checked on 2026-10-09 against the official npm bulk advisory service. The remaining advisory was reviewed on 2026-10-10.

## Remaining advisory

The lockfile includes development-only `braces@3.0.3` through tooling that uses micromatch. [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists that version as affected and does not list a patched release. The dependency audit therefore still has an open high-severity advisory.

The reported failure occurs when a deeply nested brace pattern reaches the parser. The reviewed application does not pass user request input to this parser; the dependency is used by development tooling. This limits the identified exposure but does not resolve the advisory. Build and lint tooling should run without sensitive credentials when processing untrusted code or patterns.

Lockfile changes require a new dependency audit and compatibility checks. `npm ci` reproduces the committed dependency tree. Any temporary override needs removal once parent packages adopt the intended dependency version.

The update reduces matched advisory records from 8 to 1. Next.js and eslint-config-next are pinned together at 16.3.8. Supabase packages are pinned explicitly, and CI now builds the production bundle using placeholder public configuration without contacting a production database.
