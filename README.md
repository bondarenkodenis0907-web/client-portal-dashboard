# Client Portal Dashboard

A service-request portal for building systems: clients report an issue, the service team assigns an engineer, and the client follows the work through to a recorded resolution.

[Live application](https://client-portal-dashboard-one.vercel.app) · [Checks](https://github.com/bondarenkodenis0907-web/client-portal-dashboard/actions) · [Discuss a similar project](https://t.me/BDenisD)

## The use case

A site coordinator reports a failed camera or access-control reader. The service team assigns an engineer, records the repair and gives the coordinator a result to check.

This is a portfolio project based on my experience supporting building systems.

## From a reported issue to completed work

1. **The client submits a request.** The form records a site, system, issue description and priority. The dashboard shows their own requests, with search and status filters.
2. **The service team starts work.** Staff open the shared queue, choose an engineer and move the request from New to In progress. Open work can be reassigned.
3. **The engineer's work is recorded.** Closing requires a description of what was done. PostgreSQL records the closure time and a history entry in the same transaction.
4. **The client sees the result.** The request detail shows the assigned engineer, changes in status and the resolution. Closed requests remain read-only.

## Screenshots

Screenshots use fictional accounts and requests. Workflow captures were taken against the local test backend: an offline loading-bay camera is reported, assigned and closed with a repair note.

### Client overview and request submission

![Client overview](public/screenshots/overview-client.png)
![Request submission and history](public/screenshots/requests-client.png)

### Assignment and work in progress

![Staff service queue](public/screenshots/staff-queue.png)
![Assigned engineer, processing controls and history](public/screenshots/request-in-progress.png)

### Completed work visible to the client

![Resolution and request history](public/screenshots/request-completed.png)

<img src="public/screenshots/request-mobile.png" width="390" alt="Completed request on a mobile viewport" />

### Sign-in and account settings

![Sign-in screen](public/screenshots/sign-in.png)
![Account settings captured before the request-processing update](public/screenshots/settings-client.png)

## Decisions and checks

| Area | Behavior |
| --- | --- |
| Access | PostgreSQL RLS limits clients to their own requests and events. Active staff can process the shared queue; membership is administrator-managed. Staff updates are limited to assignment, status and resolution. |
| Request lifecycle | The database requires an active engineer and the sequence New → In progress → Closed. Closing requires completed-work text. A trigger records history, which the Data API cannot edit. |
| Conflicting saves | Updates include the last observed modification time. A stale screen asks for a reload; failed saves retain edits. Assignment changes preserve the work draft in the open page's memory. |
| Staff deactivation | Revocation applies to the next database operation, including an existing session. Historical names remain; open work needs an active assignee. The account keeps ordinary access to its own requests. |
| Types | Supabase clients use the generated `Database` type. Status and priority values are checked against the UI's allowed states. Regenerate [the types](src/lib/supabase/database.types.ts) after schema changes. |
| Verification | SQL tests cover permissions, input validation and transitions. Browser tests cover submission, assignment, closure, failed and stale saves, draft preservation, deactivation and mobile layout. |

PostgreSQL rejects whitespace-only required fields, including Unicode whitespace. Site and system are limited to 120 characters, descriptions to 5,000, optional profile fields to 120 and completed work to 10–5,000. The resolution minimum excludes surrounding whitespace. Forms provide the same limits before submission.

The work draft is removed when the request closes, staff access is lost or the page is left.

The application uses Next.js, React, TypeScript and Tailwind CSS. Supabase provides authentication and PostgreSQL. Browser code uses a publishable key; staff operations do not depend on a service-role key in the application.

## Run locally

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

CI checks formatting, lint, types and a production build, then runs SQL tests and browser regressions for the lifecycle, draft preservation and staff deactivation. It starts its own local backend; production credentials are not used. See [the workflow](.github/workflows/ci.yml), [SQL tests](supabase/tests), [browser test](tests/browser/request-processing.spec.ts) and [dependency notes](docs/DEPENDENCY_SECURITY.md). Use `npm run format` to format source files and configuration before committing.

## Current boundaries

This version covers intake, assignment, processing, closure and client-visible history. It does not yet provide file attachments, email notifications, SLA escalation, reopening, pagination or a staff-management screen. History starts when the processing migration is installed; older requests keep their original details without invented historical events.
