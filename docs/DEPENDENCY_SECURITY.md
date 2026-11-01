# Dependency maintenance

Use the exact versions in package.json and package-lock.json: Node 24.19.0, npm 11.17.0, Supabase CLI 2.122.0. Install with `npm ci`.

Next.js/eslint-config-next 16.4.3 include the October security fixes; transitive Zod is 4.6.7. No overrides or advisory exclusions are configured. ESLint 9 is out of support; its major upgrade remains separate maintenance.

The 1 November 2026 registry audit of candidate `a0c1af0` found 16 moderate package records and no high/critical records. These are development-tool dependency paths to the minimatch advisory [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), not 16 separate vulnerabilities. Do not describe this candidate as having zero advisories. The separate production-only result and runtime verification are recorded in [the current check](evidence/priority-check-20261101.md).

The 29 October check verified 380 installed package signatures, including 106 attestations. Signatures were not rechecked on 1 November. These results cover their date and platform, not future packages or every optional target.

ESLint 10 cannot currently be adopted within the installed peer ranges: eslint-plugin-react 7.37.5 accepts through ESLint 9, and eslint-plugin-jsx-a11y 6.10.2 accepts through ESLint 9. Review compatible upstream releases before changing the major. Do not force an incompatible install or accept the audit's suggested downgrade to ESLint 4 / eslint-config-next 12. The minimatch advisory affects versions below 11.0.1; replacing its older majors blindly with 11 is not a tested compatible fix.

The Dependabot configuration prepares weekly npm update PRs after it reaches the default branch. Next/React/config updates are grouped; other patch/minor updates are grouped separately. Major upgrades require separate review. PRs still need CI and review; this does not enable automatic merging or make release approval unnecessary.

```sh
npm audit --audit-level=high
npm audit signatures
npm run check:security
```

The security check enforces runtime/direct-version pins, registry origins, lockfile integrity and immutable Actions references. Its secret-pattern scan covers current Git candidate text files, not full history, binaries or provider secrets. npm lifecycle-script approval was not expanded; unrs-resolver emitted a pending postinstall warning while lint/build passed.

Review upstream advisories and compatible parent updates, update the lockfile, then repeat the relevant tests. Never expose production credentials to install/build/test tooling. [Verification](evidence/verification.json) · [Release](RELEASE_ROLLBACK_RUNBOOK.md).
