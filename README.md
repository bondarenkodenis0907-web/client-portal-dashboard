# Client Portal Dashboard

A service portal for building systems: report a fault, assign an engineer and record the repair.

[Live application](https://client-portal-dashboard-one.vercel.app) · [CI](https://github.com/bondarenkodenis0907-web/client-portal-dashboard/actions)

[Follow a completed repair](docs/COMPLETED_SCENARIO.md): client reports an offline CCTV camera → engineer takes the job → repair is recorded → client reads the result and history.

![Completed request with repair notes and history](public/screenshots/request-completed.png)

Built with Next.js, React, TypeScript, Tailwind CSS and Supabase. Screenshots use fictional accounts and requests.

## Project status

The portal serves one service company and its clients. Sites, buildings, explicit admission, contract versions and private PDF publication are implemented; production had fourteen migrations at the 04.11.2026 audit. Real object/contract acceptance remains open. Building-scoped requests, building documentation, equipment and planned work are the next product stages.

The 04.11 release combines recovery verification outage handling and mobile request status refresh. Temporary Auth failures return HTTP 503 without issuing a recovery grant; explicit invalid links remain rejected. Refresh status performs a native document reload with a 44px touch target and works without JavaScript. See [recovery](docs/AUTH_RECOVERY.md), [mobile acceptance](docs/MOBILE_ACCEPTANCE_20261104.md) and [release procedure](docs/RELEASE_20261104.md).

Production publication is verified against the exact GitHub/Vercel SHA, not inferred from this document or a prepared branch. Baseline `b001fd9` passed [all eight CI jobs](https://github.com/bondarenkodenis0907-web/client-portal-dashboard/actions/runs/41467009249). The combined candidate requires its own CI. Hosted recovery acceptance, complete hosted restore and regular backup assurance remain open; the successful encrypted DB backup/isolated restore of 02.11 is a narrower verified result.

## Features

- Clients see their own requests; active staff share the service queue.
- Requests move from new to in progress to closed, with a required repair note and database-recorded history.
- Submission keys prevent duplicate requests; version checks reject concurrent edits.
- Server-side request search and pages keep older records reachable.
- Password recovery uses an email link, explicit confirmation and server-confirmed logout.
- Preview access is blocked until an isolated backend is approved.

![Service queue](public/screenshots/staff-queue.png)

<img src="public/screenshots/request-mobile.png" width="390" alt="Completed request on mobile" />

## Development

Use Node 24.19.0, npm 11.17.0 and Docker. Run `npm ci`, then follow [local setup and tests](docs/DEVELOPMENT.md).

Local changes are not released to the live application. See the [dated local verification](docs/evidence/verification.json), [environments](docs/ENVIRONMENT_REGISTER.md) and the [release checklist](docs/RELEASE_ROLLBACK_RUNBOOK.md). The owner authorized the 04.11 release; future releases require their own authorization.

The next milestone is a pilot at one real site: [development plan](docs/PROJECT_MASTER_PLAN.md) · [decisions](docs/DECISIONS.md) · [acceptance criteria](docs/QA_ACCEPTANCE_MATRIX.md).

Attachments, notifications, SLA escalation, reopening and separate contractor teams are not implemented.
