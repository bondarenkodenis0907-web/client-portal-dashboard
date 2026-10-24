# Auth Recovery — implementation and acceptance

Status: **PREPARED** on the `feature/auth-recovery` branch, not released.

## Scope

Users can request a password reset from `/login`, receive a generic response that does not reveal account existence, follow an emailed recovery link, and set a new password. The application uses Supabase Auth; no new tables, migrations, service-role browser variables or RLS changes are required.

## Safe architecture

- `/forgot-password` sends `resetPasswordForEmail` with a same-origin `/auth/callback` URL.
- The local-only recovery email template links to `/auth/callback?token_hash=...&type=recovery`. The server validates this signed hash with Supabase Auth `verifyOtp`, writes the session cookies to the redirect response, and navigates to `/reset-password` without leaking the token. Arbitrary redirect parameters are ignored; responses use no-store/no-referrer headers. This flow does not require the original browser PKCE verifier.
- `/reset-password` validates the current user session, checks password confirmation, calls `updateUser`, and signs out after a successful change. The user must sign in again.
- Never output email links, tokens, credentials, or full message bodies in CI.
- Local Supabase Auth redirect allowlist accepts only loopback URLs for port 3000 and the Playwright server on 3010.

## Acceptance tests

1. Login links to Forgot Password; request form works at mobile sizes.
2. Unknown addresses receive the same generic success copy as known addresses; no user lookup is exposed.
3. Local Supabase Mailpit receives the recovery email for a temporary verified test account.
4. Signed recovery link is verified server-side using `verifyOtp({ type: "recovery", token_hash })` and opens an authenticated reset page.
5. Mismatched passwords are rejected; a valid new password is accepted; user is signed out.
6. Signing in with new password succeeds. A missing or bad reset link is rejected.
7. Existing SQL/RLS and request-lifecycle browser tests remain green, including cross-client access, staff membership and closed-request controls.

## Environment restrictions

The `feature/auth-recovery` branch is **stacked on** `chore/block-unsafe-vercel-preview` (PR #22). The Vercel Preview application must stay blocked (503) because Preview and Production Supabase are not isolated. Do not follow password reset links against this Preview or any Production account.

For a future production rollout, the project owner must explicitly authorize the release *after* verifying:

- **RELEASE BLOCKER:** Configure the hosted Supabase Auth recovery email template to use the signed `{{ .TokenHash }}` link, e.g. `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery`, then verify the fixed callback URL `https://client-portal-dashboard-one.vercel.app/auth/callback` is allowlisted. Local configuration is in `supabase/templates/recovery.html`; the hosted template is NOT changed by this PR.
- The hosted email provider and password policies are suitable for actual customers. Email link prefetching is considered, since one-time links can be consumed by scanners; if needed, add user-initiated confirmation before `verifyOtp`.
- Real browser smoke with an approved test account; login, expired link and sign-out behave correctly.
- The Auth Recovery PR and PR #22 are reviewed, merged in dependency order, and monitored.
- A separate safe testing backend is available before the Vercel Preview guard is lifted.

## Known blocking failure (24 October 2026)

**BLOCKED / not ready for production.** The local Mailpit email sends a signed recovery link, the callback returns HTTP 303 to `/reset-password`, and the browser reports a session-cookie name present. Nevertheless, `supabase.auth.getUser()` returns `user: null` without an Auth error and the reset form is not displayed. The end-to-end browser regression fails. This is **not** a successful Auth Recovery acceptance test.

Previous PKCE implementation also failed with `pkce_code_verifier_not_found`, despite the same browser having stored a verifier. We switched only the *local* recovery email template to signed token-hash `verifyOtp`, which eliminates the PKCE verifier dependency but has not yet solved session hydration.

**Next investigation** (only on isolated Supabase / disposable users): inspect safe cookie *metadata* and server/client session presence at the callback and redirected page; verify the Next.js Proxy cookie refresh behavior; use a focused reproducible test. Do not log raw cookies, auth codes, recovery URLs, token hashes, passwords, user identifiers, or access/refresh tokens. Keep this PR Draft until the recovery email-to-new-sign-in scenario passes and is independently reviewed.

## Checks

The existing GitHub Actions `database-tests` job runs `supabase start`, PostgreSQL SQL tests and `npm run test:browser` on isolated loopback services. `password-recovery.spec.ts` exercises the email and browser flow with a disposable account and deletes that account in `finally`. This does not connect to production.

No database migration, hosted Auth provider setting, Vercel environment variable or production account is modified by this PR. The recovery template change affects only local `supabase start`; hosted Supabase email templates require a separate explicitly approved change.
