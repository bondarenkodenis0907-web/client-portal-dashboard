# Password recovery

## Verification outage fix — 04.11.2026 release

Included in the combined 04.11 release candidate from main `b001fd9`; publication is tracked by the exact candidate CI and Vercel deployment, not assumed here. See [release procedure](RELEASE_20261104.md). OTP verification and the subsequent claims/user checks now distinguish temporary errors (timeouts, rate limits, server/transport failures) from explicit rejection. A temporary failure returns private/no-store HTTP 503 without issuing a recovery grant. Because OTP consumption may already have succeeded, the response requests a new recovery link rather than promising that replay will succeed. Explicit invalid/expired OTPs, missing sessions and identity mismatches remain denied.

The route-level unit suite exercises returned and thrown failures at all three Auth steps, explicit rejection, identity mismatch, missing signing configuration before OTP consumption, and successful issuance of one protected grant. Hosted email/password acceptance remains separate. The historical baseline below describes earlier verification; it does not describe this branch as published.

## Historical baseline

Implemented in candidate #24 (application-code baseline `ac362957`) and exercised by the isolated remote CI browser/server-Auth suites in [run 41327554868](https://github.com/bondarenkodenis0907-web/client-portal-dashboard/actions/runs/41327554868). The deployed uploaded source matches `a0c1af0`; hosted email delivery, recovery and signing-secret runtime acceptance are still unverified. This does not mean those settings are absent. See [current security status](SECURITY_STATUS.md) and [source identification](DEPLOYED_VERSION_20261101.md).

1. Forgot-password requests an email with a fixed same-origin callback. Existing and unknown accounts receive the same generic success message.
2. Callback/confirmation GETs do not consume the token. A bounded, same-origin form POST verifies the fixed recovery type; redirects are relative.
3. Verification issues a signed HttpOnly/SameSite=Strict grant for ten minutes, bound to user, session ID and Auth user version. Secure is required on HTTPS/Vercel.
4. Reset endpoints check claims, current user and grant. Ordinary sessions, user metadata, forged/expired proofs and old user versions cannot authorize password changes.
5. Passwords must match, contain at least twelve characters and fit 72 UTF-8 bytes. A confirmed password write invalidates the grant.
6. Global logout uses `auth.admin.signOut(userJwt, "global")` with the publishable-key client. Auth validates the opaque JWT. Only confirmed server success permits cookie cleanup and a complete result.

Logout failure preserves the SSR session for retry. Missing sessions, 401/403 and ambiguous network results never confirm global logout. A lost acknowledgement can leave an honest unconfirmed state; an invalid/expired session may require fresh sign-in for a new revoke. Already issued access JWTs may remain valid until expiry.

The UI distinguishes invalid links, temporary check failures, failed writes, confirmed password changes with pending logout, and unknown outcomes. It does not automatically repeat ambiguous password writes. Cross-origin/malformed requests are rejected; tokens/passwords are excluded from logs and retained recovery traces.

Local Mailpit uses the recovery template in `supabase/templates`; development and hosted templates are separate. Configure the server-only signing secret, hosted redirect allowlist and SMTP only through an approved release.

The application grant does not change Supabase's direct Auth password policy. Concurrent password writes from multiple tabs and scanners that submit forms remain outside the established atomicity/GET-scanner guarantees.

[Verification](evidence/verification.json) · [Release](RELEASE_ROLLBACK_RUNBOOK.md) · [Supabase logout API](https://supabase.com/docs/reference/javascript/auth-admin-signout).

Hosted acceptance uses an explicitly approved disposable account/mailbox on the canonical production alias. Test the current baseline before release and repeat on the candidate after the approved opening of writes; the first test does not attest the candidate. The existing maintenance gate also blocks `auth.users` password updates. Do not briefly reopen writes to everyone for recovery acceptance; candidate acceptance before reopening requires separately approved isolated hosted infrastructure. See the [current release plan](RELEASE_ROLLBACK_RUNBOOK.md).
