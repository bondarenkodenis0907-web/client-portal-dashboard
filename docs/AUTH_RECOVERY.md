# Auth Recovery — implementation and acceptance

Status: **PREPARED** on the `feature/auth-recovery` branch, not released.

## Scope

Users can request a password reset from `/login`, receive a generic response that does not reveal account existence, follow an emailed recovery link, and set a new password. The application uses Supabase Auth; no new tables, migrations, service-role browser variables or RLS changes are required.

## Safe architecture

- `/forgot-password` sends `resetPasswordForEmail` with a same-origin `/auth/callback` URL.
- `/auth/callback` exchanges the short-lived PKCE authorization code on the server and redirects only to the fixed `/reset-password` path. User-provided external `next` URLs are ignored.
- `/reset-password` validates the current user session, checks password confirmation, calls `updateUser`, and signs out after a successful change. The user must sign in again.
- Never output email links, tokens, credentials, or full message bodies in CI.
- Local Supabase Auth redirect allowlist accepts only loopback URLs for port 3000 and the Playwright server on 3010.

## Acceptance tests

1. Login links to Forgot Password; request form works at mobile sizes.
2. Unknown addresses receive the same generic success copy as known addresses; no user lookup is exposed.
3. Local Supabase Mailpit receives the recovery email for a temporary verified test account.
4. Email recovery link exchanges PKCE code and opens authenticated reset page.
5. Mismatched passwords are rejected; a valid new password is accepted; user is signed out.
6. Signing in with new password succeeds. A missing or bad reset link is rejected.
7. Existing SQL/RLS and request-lifecycle browser tests remain green, including cross-client access, staff membership and closed-request controls.

## Environment restrictions

The `feature/auth-recovery` branch is **stacked on** `chore/block-unsafe-vercel-preview` (PR #22). The Vercel Preview application must stay blocked (503) because Preview and Production Supabase are not isolated. Do not follow password reset links against this Preview or any Production account.

For a future production rollout, the project owner must explicitly authorize the release *after* verifying:

- The exact production URL `https://client-portal-dashboard-one.vercel.app/auth/callback` is listed in Supabase Auth `Redirect URLs` and email templates honor `redirectTo`.
- The hosted email provider and password policies are suitable for actual customers.
- Real browser smoke with an approved test account; login, expired link and sign-out behave correctly.
- The Auth Recovery PR and PR #22 are reviewed, merged in dependency order, and monitored.
- A separate safe testing backend is available before the Vercel Preview guard is lifted.

## Checks

The existing GitHub Actions `database-tests` job runs `supabase start`, PostgreSQL SQL tests and `npm run test:browser` on isolated loopback services. `password-recovery.spec.ts` exercises the email and browser flow with a disposable account and deletes that account in `finally`. This does not connect to production.

No database migration, auth provider setting, Vercel environment variable or production account is modified by this PR.
