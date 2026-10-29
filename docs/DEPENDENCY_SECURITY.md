# Dependency maintenance

Use the exact versions in package.json and package-lock.json: Node 24.19.0, npm 11.17.0, Supabase CLI 2.122.0. Install with `npm ci`.

Next.js/eslint-config-next 16.4.3 include the October security fixes; transitive Zod is 4.6.7. No overrides or advisory exclusions are configured. ESLint 9 is out of support; its major upgrade remains separate maintenance.

The last registry check on 29 October 2026 found zero advisories and verified 380 installed package signatures, including 106 attestations. These results cover that date and platform, not future packages or every optional target. Cleanup does not update dependencies.

```sh
npm audit --audit-level=high
npm audit signatures
npm run check:security
```

The security check enforces runtime/direct-version pins, registry origins, lockfile integrity and immutable Actions references. Its secret-pattern scan covers current Git candidate text files, not full history, binaries or provider secrets. npm lifecycle-script approval was not expanded; unrs-resolver emitted a pending postinstall warning while lint/build passed.

Review upstream advisories and compatible parent updates, update the lockfile, then repeat the relevant tests. Never expose production credentials to install/build/test tooling. [Verification](evidence/verification.json) · [Release](RELEASE_ROLLBACK_RUNBOOK.md).
