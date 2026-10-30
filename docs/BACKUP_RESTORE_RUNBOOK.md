# Backup and restore

Only for the owned synthetic local profiles. This is not a production backup or hosted restore procedure.

## Run

```sh
npm run test:backup-safety
npm run test:restore:preflight
npm run test:restore
node scripts/test-saved-restore.mjs
npm run check:backup -- <run-id>
npm run restore:backup -- <run-id>
npm run test:restore:stop
```

Use pinned Node/CLI and a running Docker engine. Source uses API 56321; restore uses 57321. Both must pass ownership/address checks. Existing development and other projects are not reset.

A full drill creates four synthetic accounts, two staff memberships, three requests and six events. It encrypts a trusted custom pg_dump plus a source/config snapshot, restores into the separate target and compares fourteen inventory groups, Auth/RLS/workflow and SQL tests. One deliberate write after cutoff is absent after recovery. Measured times are not accepted RPO/RTO.

The saved-backup consumer starts only target, never source. It validates context/checksums, config/template compatibility, owner, local addresses and the exact Postgres image. Recovered files go to `.local-restore/recovered-project/<run-id>`; the checkout is not overwritten. Sessions/refresh tokens are deliberately removed in target before fresh login acceptance.

## Before database replacement

Both paths use the same preflight. Unknown schemas/tables/views/sequences, foreign relations or unexpected extension ownership refuse replacement, including unknown empty tables. Known application/Auth/provider/MFA/Vault/hook tables must contain no data.

Only named audit/migration metadata may remain. Orphan recovery PKCE is allowed only with a non-null deleted user ID, exact recovery provider and empty provider credentials. Other flows refuse replacement. New platform objects require allowlist review.

Main drill repeats target checks after stopping Auth/REST, immediately before replacement; saved restore starts DB without them. Preflight regression uses a replacement sentinel, never DROP DATABASE, and verifies fixture rows survive refusal. This guard is not a full comparison of arbitrary functions/types/roles or protection against another privileged operator concurrently writing to target.

Do not delete unknown data or use reset/--all/no-backup to bypass a refusal. Cleanup removes only the current run's known synthetic IDs. A failed import remains in the owned target for diagnosis; use the guarded DB-only consumer when appropriate.

## Artifacts and limits

Ignored `.local-backups/<run-id>` contains encrypted backup, manifest, key and sanitized reports. PASS requires result=PASS, cleaned=true and stopped=true. Plaintext dumps stay in memory/stdin; failure diagnostics are encrypted. Do not publish the directory.

Windows wraps keys with DPAPI CurrentUser: losing the Windows profile/master keys may make backups unreadable. File synchronization alone does not solve this. Linux CI keeps an ephemeral key and uploads only sanitized reports for seven days.

Local CLI API/admin defaults are shared between projects; user signing keys are separate. Use synthetic data only. User Storage files are not implemented/tested. Real DB role passwords, SMTP/OAuth/Vercel secrets, external jobs and provider config require a separate inventory/procedure.

`test-saved-restore.mjs` runs a fresh drill, then consumes its recorded encrypted archive with the source stopped. The Linux CI key is passed only in memory and wiped after the consumer; it is never published. CI preserves both sanitized reports. This proves ephemeral synthetic CI recovery, not long-term key custody. Old-format archive acceptance remains a separate check.

C10 (30.10.2026) accepts F: for the real encrypted archive, E: for the separate portable key, a backup before each release and 14-day retention; target RPO 24 h and RTO 4 h require rehearsal. Daily copying is not automated, so the RPO target is not yet assured. D06/D07 remain open for full configuration/file scope, measured recovery, schedule/owner/support and external alert contact. No paid service, recurring automation or external alert was enabled.

For an incident: preserve evidence and damaged source, stop affected writes, validate backup/key/versions, restore separately, compare data/rights and reconcile post-cutoff writes. Switching real users or restoring production needs separate approval. [Release/rollback](RELEASE_ROLLBACK_RUNBOOK.md) · [Verification](evidence/verification.json).
