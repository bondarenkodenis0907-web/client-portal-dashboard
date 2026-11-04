# Mobile acceptance — 04.11.2026

Production observations supplied by the user on an Android phone:

- Sites renders its empty state and zero total.
- The navigation drawer opens, labels fit and Sites is highlighted.
- Overview and the request form render. The right edge/scrolling of Recent requests and the bottom of the submission form remain unverified.
- An existing closed request shows the assigned engineer, resolution, UTC timestamps and all three events (new, in_progress, closed). This verifies reading an existing record, not a new end-to-end processing run.
- The user reports that Refresh status does not respond to taps. The source has an onClick calling router.refresh without visible pending/completion feedback; whether a request actually reached the server on that device is unknown.

## Proposed refresh change

PREPARED in `fix/request-refresh-mobile-20261104` from main `b001fd9`, not deployed or accepted on the user's phone. Replace the JavaScript-only refresh button with a native same-page link and a touch target at least 44px high. It requests the document from the server using the existing authenticated/RLS-protected route, works before hydration or with JavaScript disabled, and returns the user to the top of the card where status is displayed. It does not change database state, role grants or the staff processing flow. No synthetic success confirmation is displayed.

The isolated browser regression taps the link at 390px width with JavaScript enabled and disabled, requires a successful document navigation and the resulting request card/history, and checks that version/status are unchanged. It uses only the existing guarded local synthetic fixture. Docker is unavailable in the editing environment, so this browser test requires PR CI; it must not run against production.

After CI/review and an approved release, repeat the tap on the user's phone and confirm a document reload, preserved Closed status/result and no duplicate events. Test an open request after an authorized staff change in an isolated environment. Settings, other-client denial, staff mobile processing, hosted recovery and real object/contract acceptance remain open.

The recovery outage change in PR #35 is separate. Its successful CI does not attest this refresh branch, and neither change is published merely by opening a PR.
