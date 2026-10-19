# Clinic workflow update — 19 October 2026

## Changed behavior

- Sync status opens a local queue with record identity, attempts, error and the last acknowledged cloud upload. A queue item is not necessarily one patient.
- Both apps show SMS history from durable local storage and the outbox. Android parks ambiguous delivery results for manual review. Gateway acceptance is not phone delivery confirmation.
- Manual SMS review preserves a record of the original uncertain request. An explicit resend gets a fresh request ID.
- Due payments accept the amount received now and its payment method. Balance validation runs again inside the storage transaction to reject a stale collection screen.
- Receipts retain their payment date and method; they can be reopened from patient history. Historical combined receipts are labelled as legacy records.
- Billing changes and before/after audit records commit together. The edit screen requires a correction reason.
- Daily collections and payment reports use individual receipt dates, including partial payments and collections against older bills.
- Patient profile dues subtract discount. Offline bills attach locally cached patients even after a local-to-cloud ID change.
- A shared mobile number presents a patient choice and an explicit new-family-member option. Existing patients are not silently selected and overwritten.
- Follow-up list shows active cases, due/missing dates, and doctor-confirmed cast removal appointments. Removal dates are entered explicitly and stored using the existing appointments schema. No treatment interval is inferred.
- Android gains Product Rate List, Daily Cash Book, service-specific Hindi bill SMS and an offline patient timeline.
- Backup settings show the last attempt, failures and limited coverage. Restore previews counts and refuses to replace existing clinic data or pending work. Existing attachments still need a separate copy; a JSON URL is not an image backup.
- Windows CI uses the checked-out source, npm ci and serialized runs. It no longer resets source during a build or deletes/force-updates release tags.

## Verification

Synthetic records only; no real patient messages or production SQL writes.

- Both projects: TypeScript checks; 8 storage-backed clinic workflow regression checks each.
- Android: 20 existing mobile regression checks.
- Windows: offline login/session/cloud/API checks, offline-first/data-integrity checks, SMS retry/journal checks, catalog/Hindi SMS checks and the 29-check audit suite.
- Windows React production bundle builds locally.

The Android repository contains a large existing skeleton.dae asset that the connected file reader does not return locally. Its original blob is preserved in the GitHub tree. Full Android bundle/native packaging must be verified by GitHub Actions.

## Device checks still required

1. Install the new EXE/APK on test devices with a backup, not over the only copy of clinic data.
2. Turn internet off, register two family members with one number, create a discounted bill, collect due in two payment methods, restart, and check receipts/history.
3. Reconnect; confirm parent patient/bill dependencies upload and pending counts drain. A schema/API/permission error must remain visible without deleting work.
4. Send to an approved test number: normal gateway response, cloud unavailable, timeout, restart, then explicit uncertain-SMS review. Confirm accepted requests are not automatically sent twice.
5. Check today/monthly Cash Book against receipt dates; verify printing/PDF and Android backup export/restore on an empty test device.
6. Review cloud conflict behavior before accepting simultaneous offline payments for one bill from different devices.

Code presence and a passing CI build do not establish live patient/SMS backlog clearance or successful SMS delivery.
