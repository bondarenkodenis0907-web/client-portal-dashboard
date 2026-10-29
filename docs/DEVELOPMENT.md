# Local development

Use Node 24.19.0 and npm 11.17.0. Docker is needed for login, database and browser tests; editing, lint and type checks work without it. CI starts its own local backend.

## Setup

```sh
npm ci
npx --no-install supabase start
```

This starts the development project. Never reset an existing database to run tests. Read its local publishable key using the CLI and create an ignored `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_local_publishable_key
RECOVERY_SIGNING_SECRET=your_random_server_only_secret_at_least_32_characters
```

Run `npm run dev` and open http://localhost:3000. Do not put privileged keys in public variables. Existing development schema has historical drift; regression tests use a separate backend.

## Staff access

An administrator grants membership to a verified account:

```sql
insert into public.service_staff (user_id, display_name)
select id, 'Service engineer' from auth.users where email = 'engineer@example.test'
on conflict (user_id) do update
set display_name = excluded.display_name, is_active = true;
```

Set `is_active = false` to revoke membership; keep the row and user to preserve assignments/history. Staff currently share one queue. Registration and account metadata never grant staff access.

## Checks

```sh
npm run format:check
npm run lint
npx next typegen
npx tsc --noEmit
npm run check:security
node --test tests/*.test.mjs
npm run test:preview-guard
npm run test:local
npm run test:local:stop
```

Run app builds and browser/Preview tests sequentially: they share `.next`. Use placeholder environment values for standalone builds. Never build with production credentials locally.

`test:local` validates ten migrations, runs SQL tests, builds with webpack and runs browser tests. It creates a checkout-specific project under ignored `.local-tests`, using API/DB/Mailpit ports 56321/56322/56324. Node/CLI versions, ownership, migration snapshots and loopback API are checked before test writes. Only synthetic accounts are created. `test:browser` runs the same browser path; `test:local:reset` resets only the owned test profile after a reviewed migration change.

Next.js Proxy denies Preview/Netlify/unknown hosts before Auth. The local test exception requires port 56321 and no cloud flags; never enable it on hosted environments.

[Recovery](AUTH_RECOVERY.md) · [Backup and restore](BACKUP_RESTORE_RUNBOOK.md) · [Dependencies](DEPENDENCY_SECURITY.md) · [Release](RELEASE_ROLLBACK_RUNBOOK.md).

CI is prepared locally. Passing local tests does not mean remote CI or hosted acceptance has run.
