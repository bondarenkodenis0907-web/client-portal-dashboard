# Local development

Requirements: Node.js 22 or later, npm, the Supabase CLI and Docker.

```bash
git clone https://github.com/bondarenkodenis0907-web/client-portal-dashboard.git
cd client-portal-dashboard
npm ci
supabase start
```

Use the local values from `supabase status` in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_local_publishable_key
```

```bash
npm run dev
```

Open http://localhost:3000 and register separate client and staff accounts. Registration either opens a session or asks for email confirmation, depending on the backend setting.

For an existing hosted Supabase project, apply the migrations in `supabase/migrations` before deploying the matching application version. Never put a secret or service-role key in a `NEXT_PUBLIC_` variable.

### Grant staff access

An administrator grants access to an existing, verified account in the SQL editor. Replace the example address with the intended staff account; registering alone never grants staff access.

```sql
insert into public.service_staff (user_id, display_name)
select id, 'Service engineer'
from auth.users
where email = 'engineer@example.test'
on conflict (user_id) do update
set display_name = excluded.display_name,
    is_active = true;
```

After a page reload, staff can open **Service queue** in the navigation. All staff in this version belong to one service team and can process every client's request. It does not implement separate contractor organizations or tenant-scoped staff teams.

To revoke staff access, keep the membership row and deactivate it instead of deleting the account or breaking recorded assignments:

```sql
update public.service_staff
set is_active = false
where user_id = (
  select id from auth.users where email = 'engineer@example.test'
);
```

Only an administrator can change this flag. Use `is_active = true` to restore access. Revocation takes effect for the next database operation; an already open screen can still display previously loaded information until it refreshes. Names on closed requests and the event history remain available to authorized viewers.

## Preview safety (temporary)

**No cloud Preview has a verified isolated Supabase backend.** Production is hosted on Vercel; Netlify is not an authorized production host. Vercel currently assigns the same `NEXT_PUBLIC_SUPABASE_URL` and publishable-key variables to Production, Preview and Development. Environment target assignment is not backend isolation.

The Next.js `src/proxy.ts` denies application traffic by default with HTTP 503, `Cache-Control: no-store`, and `X-Robots-Tag: noindex, nofollow` **before** any Supabase Auth refresh unless one of these conditions holds:

- `VERCEL_ENV=production` — the established Vercel Production deployment; or
- localhost/127.0.0.1 with `NODE_ENV=development` (local development), or an explicit `CLIENT_PORTAL_LOCAL_TESTS=1` (isolated test runner only).

This rejects Vercel Preview, Netlify Deploy Previews/branch deploys and other unapproved public hosts even if Netlify-specific environment variables (`NETLIFY`, `CONTEXT`) are absent at runtime. **Do not set `CLIENT_PORTAL_LOCAL_TESTS=1` on any hosted environment.** `scripts/browser-tests.mjs` sets it only after checking that the Supabase CLI API URL resolves to loopback.

The CI `check` job builds with harmless public placeholders and verifies an unapproved host defaults to HTTP 503. The `preview-guard` job simulates both Vercel Preview and Netlify deploy-preview using placeholder public values, checking GET and POST application paths. `database-tests` starts a temporary local Supabase, runs SQL/RLS tests and full Playwright request lifecycle. CI never reads production Auth secrets.

### External deployment limitations / unresolved release gates

- **Vercel:** Deployment Protection is enabled. The connected integration cannot obtain a protected deployment's HTML (permission 403), so a real HTTP 503 app response is **not yet verified**. Restoring scoped Vercel access and running read-only GET checks is still required.
- **Netlify:** A Netlify bot reported `https://deploy-preview-22--client-portal-dashboard.netlify.app` on PR #22. Its provider-level access protection, runtime environment and original data connection are **not verified**. Netlify build-scoped values are not guaranteed to be available in Functions/Edge runtime. Even passing CI cannot prove a Netlify deploy executes the Proxy. Existing old deploy URLs are not patched by new commits. Before release, use **Netlify → Project configuration → Developer settings → Continuous deployment → Branches and deploy contexts** to disable future Deploy Previews if Netlify is not needed; separately protect or delete existing preview deployments after confirming impact. Keep any currently reachable Preview untrusted until verified.
- **Older deployments:** Vercel and Netlify may have immutable deployment URLs from before these guards. Vercel protection must remain enabled; do not create unprotected exceptions. Do not infer that all historical URLs are safe from the current commit's tests.
- **Direct API:** A frontend HTTP 503 is a mitigation, not Supabase tenant isolation. Direct Supabase Auth/REST public endpoints remain reachable. RLS and proper Auth permissions must remain enforced independently.

**Do not** run account registration, password recovery, request creation or staff tests on any cloud Preview until backend isolation is confirmed. Never copy production data into Preview. The guard must be removed only after a reviewed separate Supabase Preview backend and per-branch Vercel environment variables are verified.

## Verification

```bash
npm run lint
npm run format:check
npx next typegen
npx tsc --noEmit
npm run build
supabase test db
npx playwright install chromium
npm run test:browser
```

`test:browser` reads only local Supabase configuration, refuses a remote backend, creates temporary accounts and removes their data afterward. It builds the app and runs it on port 3010. On a machine with an existing Edge installation, `PLAYWRIGHT_CHANNEL=msedge` can select that browser.

CI checks formatting, lint, types and a production build, then runs SQL tests and browser regressions for the lifecycle, draft preservation and staff deactivation. It starts its own local backend; production credentials are not used. See [the workflow](../.github/workflows/ci.yml), [SQL tests](../supabase/tests), [browser test](../tests/browser/request-processing.spec.ts) and [dependency notes](DEPENDENCY_SECURITY.md). Use `npm run format` to format source files and configuration before committing.

## Scope

This version covers intake, assignment, processing, closure and client-visible history. It does not yet provide file attachments, email notifications, SLA escalation, reopening, pagination or a staff-management screen. History starts when the processing migration is installed; older requests keep their original details without invented historical events.
