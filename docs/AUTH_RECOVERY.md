# Auth Recovery — implementation and acceptance

Status: **PREPARED** on the `feature/auth-recovery` branch, not released.

## Scope

Users can request a password reset from `/login`, receive a generic response that does not reveal account existence, follow an emailed recovery link, and set a new password. The application uses Supabase Auth; no new tables, migrations, service-role browser variables or RLS changes are required.

## Safe architecture

- `/forgot-password` sends `resetPasswordForEmail` with a same-origin `/auth/callback` URL.
- The local-only recovery email template links to `/auth/callback?token_hash=...&type=recovery`. **GET never calls `verifyOtp`**. Instead it issues a fixed relative 303 redirect to `/auth/confirm?token_hash=...`. The confirmation page is rendered with `no-store`, `no-referrer`, and `noindex` headers. The user must press **Continue password reset**, submitting a same-origin POST to `/auth/verify-recovery`. Only that POST invokes Supabase Auth `verifyOtp`, writes SSR session cookies and redirects with a fixed relative Location to `/reset-password` (or safely to `/forgot-password?status=invalid`). External `next` URLs are ignored. This uses signed token-hash verification without a browser PKCE verifier.
- `/reset-password` validates the current user session, checks password confirmation, calls `updateUser`, and signs out after a successful change. The user must sign in again.
- Never output email links, tokens, credentials, or full message bodies in CI.
- Local Supabase Auth redirect allowlist accepts only loopback URLs for port 3000 and the Playwright server on 3010.

## Acceptance tests

1. Login links to Forgot Password; request form works at mobile sizes.
2. Unknown addresses receive the same generic success copy as known addresses; no user lookup is exposed.
3. Local Supabase Mailpit receives the recovery email for a temporary verified test account.
4. GET on the signed recovery link and intermediate confirmation page **never verifies/consumes the token** (including repeated GETs, link-preview scanners and reloads). A user-initiated same-origin POST then verifies it with `verifyOtp({ type: "recovery", token_hash })` and opens an authenticated reset page.
5. Mismatched passwords are rejected; a valid new password is accepted; user is signed out.
6. Signing in with new password succeeds. A missing or malformed reset link and repeated POST of a consumed recovery token are rejected.
7. Existing SQL/RLS and request-lifecycle browser tests remain green, including cross-client access, staff membership and closed-request controls.

## Environment restrictions

The `feature/auth-recovery` branch is **stacked on** `chore/block-unsafe-vercel-preview` (PR #22). The Vercel Preview application must stay blocked (503) because Preview and Production Supabase are not isolated. Do not follow password reset links against this Preview or any Production account.

For a future production rollout, the project owner must explicitly authorize the release *after* verifying:

- **RELEASE BLOCKER:** Configure the hosted Supabase Auth recovery email template to use the signed `{{ .TokenHash }}` link, e.g. `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery`, then verify the fixed callback URL `https://client-portal-dashboard-one.vercel.app/auth/callback` is allowlisted. Local configuration is in `supabase/templates/recovery.html`; the hosted template is NOT changed by this PR.
- The hosted email provider and password policies are suitable for actual customers. **Email-link prefetching is mitigated by requiring an explicit user-initiated POST before verifying the one-time token**. This does not defend against scanners that actively submit forms or an attacker with access to the email/token.
- Real browser smoke with an approved test account; login, expired link and sign-out behave correctly.
- The Auth Recovery PR and PR #22 are reviewed, merged in dependency order, and monitored.
- A separate safe testing backend is available before the Vercel Preview guard is lifted.

## Isolated Auth-cookie compatibility finding (24 October 2026)

**Root cause proven in CI:** the recovery link was opened on `127.0.0.1`, but the callback's absolute redirect (built from `request.nextUrl.clone()`) sent the browser to `localhost`. The server had written a host-scoped Auth-cookie for `127.0.0.1`; browser JavaScript at `localhost` could not see it. The same cookie was valid for the Next.js Proxy on `127.0.0.1`. Therefore `getUser()` returned no browser user although server-side authentication succeeded.

Evidence from isolated Playwright metadata only:
- callback HTTP 303 and `Set-Cookie` present
- host of clicked recovery link: `127.0.0.1`; final reset-page host: `localhost`
- cookie domain: `127.0.0.1`; path `/`; `HttpOnly=false`; not visible in `document.cookie` on `localhost`
- direct server-side Proxy probe of `/dashboard` on `127.0.0.1` succeeded

**Fix prepared:** callback uses a fixed, relative HTTP `Location: /reset-password` (or `/forgot-password?status=invalid`) with HTTP 303. The browser resolves this against its current origin, preserving exact hostname, protocol and port. No untrusted `Host`, `next`, or other external redirect target is accepted. Tests now assert exact hostname stability and Auth-cookie visibility.

**Release gate:** the full email → verification → password update → fresh sign-in browser test and all CI jobs must PASS on the final commit. Earlier builds with broken redirects remain failed historical runs. Host-relative redirects and cookie compatibility require code review before production. Do not expose raw cookies, codes, recovery URLs, token hashes, passwords or user identifiers in CI logs.

## Email security scanner mitigation (24 October 2026)

The mail scanner must not be able to consume a recovery token by following GET links. Therefore:

1. `GET /auth/callback` validates only the token-hash shape and request type, returning a relative 303 to a confirmation page; it performs **no auth exchange**.
2. `GET /auth/confirm` displays the explanation and a form with a deliberate Continue button; it does not call Supabase Auth. `Cache-Control: private, no-store` and `Referrer-Policy: no-referrer` prevent the token-bearing URL being cached or included in referrers.
3. `POST /auth/verify-recovery` accepts only form content, rejects explicit cross-site browser requests using Fetch Metadata, validates the token format, and calls `verifyOtp` once. It returns a fixed relative redirect, never an arbitrary callback destination.
4. Isolated Playwright simulates scanner GETs, a reload, the deliberate POST, successful password replacement and fresh login, then a rejected token replay.

**Limitations:** this prevents conventional GET-only scanning from consuming the token, not arbitrary automated POST submissions or compromised mailboxes. Signed token hashes remain in the user's email and confirmation URL until confirmation; do not log URLs, token values or passwords. Hosted email-template/redirect URL configuration still requires separate owner approval. This does not make the cloud Preview safe to test with real accounts.

## Checks

The existing GitHub Actions `database-tests` job runs `supabase start`, PostgreSQL SQL tests and `npm run test:browser` on isolated loopback services. `password-recovery.spec.ts` exercises the email and browser flow with a disposable account and deletes that account in `finally`. This does not connect to production.

No database migration, hosted Auth provider setting, Vercel environment variable or production account is modified by this PR. The recovery template change affects only local `supabase start`; hosted Supabase email templates require a separate explicitly approved change.
