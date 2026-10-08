# Offline SMS fixes — 2026-10-08

SMS requests now enter the durable desktop queue before any network operation. The call returns queued status after that local write; no cloud logging or network probe blocks it. The existing authenticated desktop session is still required.

SMS and database sync run in separate lanes. Missing cloud authentication cannot prevent gateway dispatch, and a stalled SMS request does not block the current data sync pass. The desktop sender has a 15-second timeout.

Each request has a stable UUID, including legacy queued SMS upgraded in place. A SQLite metadata journal records dispatch intent before contacting the gateway and acceptance before returning. Queue cleanup or cloud-log failures retry without another gateway call. The cloud SMS log is a normal durable queued insert with the same UUID.

A timeout, crash after dispatch, server error, or failed acceptance journal write has an unknown delivery outcome. These requests remain visible as delivery unconfirmed and are not automatically resent. The gateway must be checked before issuing a new SMS. Gateway acceptance is not proof that a phone received the message. Without provider idempotency/delivery reconciliation it is impossible to promise both no duplicates and automatic retry for every ambiguous outcome.

SMS Logs reads local cached history and the outbox, refreshes on queue changes, shows errors, and works without cloud access. Existing patient/billing rows and pending work are not deleted. No SQL migration is introduced.

Verification: tests/sms-offline.cjs (isolated real SQLite plus fake gateway) covers offline queue/reopen, cloud-login failure, durable acceptance, cleanup failure, pre/post-dispatch disk failure, timeout, rejection retry, legacy IDs, independent sync lanes and history states. Added to Windows CI. Existing offline-first, report-02-20, deep-audit and audit-26 suites, TypeScript and production build also pass. Offline browser history/search tested with fixtures; no real SMS sent.
