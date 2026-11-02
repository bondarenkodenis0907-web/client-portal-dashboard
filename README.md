# Client Portal Dashboard

A service portal for building systems: report a fault, assign an engineer and record the repair.

[Live application](https://client-portal-dashboard-one.vercel.app) · [CI](https://github.com/bondarenkodenis0907-web/client-portal-dashboard/actions)

[Follow a completed repair](docs/COMPLETED_SCENARIO.md): client reports an offline CCTV camera → engineer takes the job → repair is recorded → client reads the result and history.

![Completed request with repair notes and history](public/screenshots/request-completed.png)

Built with Next.js, React, TypeScript, Tailwind CSS and Supabase. Screenshots use fictional accounts and requests.

## Project status

The [live application](https://client-portal-dashboard-one.vercel.app) uses uploaded source `a0c1af06`. The integrated [release candidate #24](https://github.com/bondarenkodenis0907-web/client-portal-dashboard/pull/24) adds retryable Proxy Auth failure handling and the updated demonstration. Its application-code baseline `ac362957` passed [all eight CI jobs](https://github.com/bondarenkodenis0907-web/client-portal-dashboard/actions/runs/41327554868): 43 unit/policy tests, 230 SQL assertions, 35 browser cases, server-Auth, guard, maintenance, rollback and synthetic restore checks.

`main` is still `00fc4b8`; it is behind the deployed source and candidate. Production already has eleven migrations. Do not replay the historical eight-to-eleven migration sequence. Hosted recovery, a fresh production backup with an independent restore, and the release window remain open. The selected cloud rollback is recorded in the [current release plan](docs/RELEASE_ROLLBACK_RUNBOOK.md); it has not been exercised in the cloud.

Screenshots show the candidate on an isolated backend with fictional data. The next planned product stage is a facility with a contract and buildings, each with documentation, equipment, planned work and requests. Contracts, documents, equipment and planned-work modules remain planned; the separate directory slice is described below. See the [roadmap](docs/PROJECT_MASTER_PLAN.md) and [verified security status](docs/SECURITY_STATUS.md).

## Facility directory development

A separate feature branch prepares persisted sites, buildings and explicit client admission with server-rendered directory pages. Clients see only assigned sites; active staff can read the company directory. Provisioning is administrative; there is no customer self-enrolment. See the [scope and acceptance criteria](docs/FACILITY_DIRECTORY.md). This feature is not in production or the #24 baseline; its twelfth migration is only for isolated development until reviewed and approved.

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

Local changes are not released to the live application. See the [dated local verification](docs/evidence/verification.json), [environments](docs/ENVIRONMENT_REGISTER.md) and the [release checklist](docs/RELEASE_ROLLBACK_RUNBOOK.md). Publication still requires approval.

The next milestone is a pilot at one real site: [development plan](docs/PROJECT_MASTER_PLAN.md) · [decisions](docs/DECISIONS.md) · [acceptance criteria](docs/QA_ACCEPTANCE_MATRIX.md).

Attachments, notifications, SLA escalation, reopening and separate contractor teams are not implemented.
