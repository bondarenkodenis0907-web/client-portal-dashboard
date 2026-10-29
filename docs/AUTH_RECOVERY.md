# Password recovery

Local implementation; hosted Auth/SMTP configuration is still pending.

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
