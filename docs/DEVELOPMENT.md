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

**Vercel Preview is deliberately unavailable while it shares the Production Supabase configuration.** The application Proxy returns HTTP 503 with `Cache-Control: no-store` when `VERCEL_ENV=preview`, before authentication or database work. This blocks application routes, not static asset paths, and is **not a substitute for a separate database**. Existing older Preview deployments do not inherit this protection.

CI runs `preview-guard` in a separate GitHub-hosted job. It compiles a Next.js Preview build with harmless placeholder public Supabase values and checks that key pages and a POST request return HTTP 503. The existing `database-tests` job remains isolated: `supabase start` starts a temporary local database, SQL tests run against it, and the browser test runner refuses any non-loopback Supabase URL.

Until an isolated online test database is available:
- Do not test account registration, password recovery, ticket creation, or staff actions on Vercel Preview.
- Do not expose Production keys or data to GitHub Actions or to unreviewed test builds.
- Treat Preview as unverified until the deployed Preview URL also passes a read-only HTTP 503 smoke test.
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
