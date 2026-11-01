# Proxy, dependencies and scenario check — 1 November 2026

Scope: release candidate `a0c1af06b842e52e0b98d015adae15433fa2922d` in draft PR #24, plus documentation and Dependabot changes. This is not a production-release acceptance record.

## Technical results

- `src/proxy.ts` is beside `src/app`, as required by the Next.js convention. The production build prints `Proxy (Middleware)`.
- `npm run test:preview-guard`: PASS for Vercel, Netlify and unapproved hosts, 48 HTTP assertions per mode, 144 total. Denied requests set no Auth cookies and make zero backend calls. The expired-cookie positive control runs first.
- `npm run test:preview-guard -- maintenance`: PASS, 48 HTTP assertions, including Retry-After and no Auth-cookie refresh.
- `node --test tests/*.test.mjs`: 39 passed, zero failed/skipped.
- `npm run lint` and `tsc --noEmit`: passed.
- Installed Next.js and eslint-config-next: 16.4.3, from the committed lockfile.
- Full `npm audit --json`: 16 moderate package records, zero high/critical. The root advisory is minimatch GHSA-g3hv-75wg-m249, with propagated development-tool findings. An exit code of 1 is expected for this result.
- `npm audit --omit=dev --json`: zero advisories.

Dependencies were installed with `npm ci --ignore-scripts --engine-strict=false`. This runner has Node 24.22.1 / npm 11.9.0, rather than the project's exact Node 24.19.0 / npm 11.17.0. These checks supplement pinned CI; they do not prove exact-runtime reproducibility. Lifecycle scripts were not enabled. The runtime security gate was not claimed as passing on this runner.

## Presentation

README now links directly to a completed CCTV repair walkthrough. It uses the existing queue, in-progress, closed and mobile screenshots and links to the actual browser test and local reproduction command. The screens are fictional demo data from an earlier run; they were not recaptured today. No new live browser/database run was performed because Docker is unavailable here.

## Remaining work

Review compatible upstream fixes for minimatch and a supported ESLint major. The currently installed React/a11y lint plugins do not declare ESLint 10 compatibility; no peer bypass, forced downgrade or blanket minimatch major override was used.

The weekly Dependabot configuration becomes active once merged into the default branch. Review generated PRs and rerun CI. This change does not merge PR #24, apply migrations, change provider configuration or release production. The release gates and environment isolation requirements in the release runbook remain open.

References: [Next.js Proxy location](https://nextjs.org/docs/app/api-reference/file-conventions/proxy), [ESLint version support](https://eslint.org/version-support/), [minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249).
