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

**All app Preview hosts must be unavailable while they may share Production Supabase configuration.** The application Proxy returns HTTP 503 with `Cache-Control: no-store` before any auth/database call on Vercel Preview (`VERCEL_ENV=preview`), on a Netlify build (`NETLIFY=true` or `CONTEXT=deploy-preview/branch-deploy`), and on `*.netlify.app` hosts. Netlify is **not an approved production host** for this project. This blocks application routes, not static assets, and **is not an isolated Preview database or a replacement for host-level access protection**. A raw Supabase endpoint remains outside this guard.

GitHub PR #22 has **two separately configured Netlify projects** generating previews: `https://deploy-preview-22--client-portal-dashboard.netlify.app` and `https://deploy-preview-22--ornate-daffodil-920c83.netlify.app`. Its provider-side access policy, environment variables and **all previously published builds** are NOT confirmed secure. The updated code applies to future Netlify builds only. Disabling the redundant Netlify integration or its Deploy Previews at the Netlify dashboard is the safest option while cloud Preview Supabase isolation is unavailable. Do not assume this code protects an already published deploy or any Netlify functions that bypass the Next.js Proxy.

CI runs `preview-guard` using harmless placeholder public Supabase values, compiles **separate Vercel and Netlify Preview simulations**, and asserts app GET and POST routes return HTTP 503/no-store. A separate PR #22-only `preview-host-smoke` job does a **read-only GET** on the known Vercel Preview and both Netlify project domains/previews; only HTTP 401/403 (host protection) or 503 (application maintenance guard) passes. A 200, redirect, or connection error leaves isolation **unverified**. This job never accesses Supabase directly or submits forms. This only proves the checked source; the real deployed Preview must still be checked via read-only GET (expected 503 from the app or a confirmed 401/403 from provider access protection). The existing `database-tests` job remains isolated: `supabase start` starts a temporary local database, SQL tests run against it, and the browser test runner refuses any non-loopback Supabase URL.

Until an isolated online test database is available:
- Do not test account registration, password recovery, ticket creation, or staff actions on Vercel Preview.
- Do not expose Production keys or data to GitHub Actions or to unreviewed test builds.
- Treat each actual Vercel and Netlify Preview as unverified until a read-only GET confirms its deployment-level protection or an app HTTP 503. A 403 returned by a connector's authorization API is **not** evidence that the app returned 403.
- Audit Netlify settings and legacy URLs directly in the Netlify dashboard; Github PR notification alone does not prove the deployment is protected.
- Do not allow Netlify previews to share or embed Production Supabase connection details, including the public URL and publishable key, even if the Next.js Proxy denies normal UI routes. Disable Netlify auto deployments when this cannot be guaranteed.
- Remove this guard **only** in a separate reviewed PR after configuring and verifying a distinct Preview Supabase project. Keep changes to Production, database policies and live data outside such a PR.

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
