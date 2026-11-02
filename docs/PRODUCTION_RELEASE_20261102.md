# Production release — 2 November 2026

## Deployment and scope

Main application source: `b001fd921a4f02b3c40feb629bdcdd601dd1092a`. Owner authorized production publication and acceptance on the live project; #30 → #29 → #24 are merged. Vercel production `dpl_BBNzNkpNaJpod5fgYGCdJAYp98DL` is READY with matching Git metadata and alias https://client-portal-dashboard-one.vercel.app.

GitHub compare candidate `a79cb5b` → main returned files=[]: identical files. Candidate [CI 41465160357](https://github.com/bondarenkodenis0907-web/client-portal-dashboard/actions/runs/41465160357) passed eight jobs: 46 unit/policy, 346 SQL, 41 E2E, server integration, four guards, maintenance/canary, compatible rollback and fresh/saved synthetic restore. Separate main [CI 41467009249](https://github.com/bondarenkodenis0907-web/client-portal-dashboard/actions/runs/41467009249): seven jobs passed, including all regression, database, guard and restore jobs. Logs confirm 346 SQL, 41 E2E and compatible rollback. The final aggregate release-gates job was still running when this documentation commit was prepared; its status must be checked independently.

Deployed: assigned sites/buildings, explicit manager admission, site create/edit/archive with version checks, immutable contract snapshots/private PDFs and deliberate client publication. Owner accepted PDF up to 2 MiB in private PostgreSQL. Building management/admission provisioning remain administrative. Equipment, building documents, planned work and building-scoped requests remain planned.

## Production verification

After the owner applied the three SHA-256-verified files in one psql transaction, direct read-only verification confirmed exact versions `20261102114046`, `20261102123056`, `20261102140100` alongside the original eleven. All eleven public tables and private.contract_files have RLS; thirteen maintenance triggers exist; maintenance=false. Anonymous save_site EXECUTE and authenticated contract_versions UPDATE are denied.

Migration history, grants and the maintenance barrier were verified; production SQL regression/fault injection was not run. No manager/client admission was created and no existing client records were edited by the release.

## Backup evidence and limits

Owner reported an encrypted pre-migration archive of 164304 bytes, stored on F: with a separate portable key/HMAC on E:. Successful script output confirmed transferred-byte SHA-256 and isolated transactional restore in a new PostgreSQL 17 container with no network and memory-only database storage. Eleven migrations restored; RLS=true on profiles/request_events/service_requests/service_staff. The script checked HMAC before restore. Container was removed afterward. Agent did not access dump/key.

Scope: public/private/auth/supabase_migrations. This is a pre-facility snapshot, not a backup of future contract writes. Restore used --no-owner and NOLOGIN placeholder platform roles. Full owners/role attributes, hosted Auth login, Storage objects, external provider/Vercel/SMTP settings, source-count equality at an attested UTC cutoff and hosted restore were not verified. This is a bounded DB restore result, not full disaster-recovery certification. A new backup is needed before the next release; retain post-cutoff records on rollback.

## Hosted smoke and remaining acceptance

HTTP /login returned 200 with private/no-store; login form was observed in browser. /dashboard/sites without session returned 307 to /login and browser navigation also showed login. /api/facility/files/00000000-0000-4000-8000-000000000001 without session returned 401, private/no-store.

Authenticated manager/client operations, real PDF upload/publication/download, mobile acceptance and the completed request flow are PENDING on production. Synthetic CI is separate evidence. Hosted password recovery is deferred by owner decision; its code and isolated tests remain.

Vercel runtime log read returned 403. No authenticated Vercel CLI is available here; no clean-log claim is made. Monitoring/observability access remains open.

## Rollback and next step

Previous production `dpl_7ge2eQz56sSgVe1CRcQqM8d3k6od` is the pinned compatible frontend rollback. CI rehearsed old frontend continuity on the additive schema; cloud switching/eligibility were not exercised. Keep fourteen migrations and new objects/contracts/PDFs during frontend rollback; never return to old main `00fc4b8` or use a destructive down migration. Real DB restore needs a separate decision and post-cutoff reconciliation.

Status: DEPLOYED, limited unauthenticated smoke PASS, authenticated product acceptance PENDING. Next: agree exact test identities and their admissions, then execute the site/contract matrix. This record supersedes earlier unmerged/eleven-migration/NO-GO statements for this release; historical evidence retains its original scope.
