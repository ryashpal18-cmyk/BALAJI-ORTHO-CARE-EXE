# EXE: follow-up deep review, 31 October 2026

## Current repair status

All source repair groups 57–82 (58/64 combined), plus the remaining structure
validation for item 55, are implemented. Item 51 remains excluded. Local
validation: 39 Node suites, TypeScript and production build passed. New SQL was
verified with PGlite, including the existing receipt-merging trigger used in
BJ BACKUP. Cloud deployment and native Windows review are checked separately
before the main release. BJ BACKUP migration
`20261031091847_clinic_deep_review_finance_and_session_guards` is applied and
verified: five guards installed, full bill revision checks active, anonymous
finance/delete execution denied. The migration contains no historical DML.
The current live snapshot is 1,149 patients / 1,307 bills / 741 SMS logs; clinic
records grew during the review, so unchanged aggregate counts are not claimed.
Security advisors show no new warnings; anonymous delete execution warning was
removed. The findings below record the original reproduction,
not the behavior of the repaired code.

- Finance: full bill revision checks, append-only history, cancellation and
  closed-day guards, protected financial deletes, atomic acknowledgement.
- Messaging/identity: stale-recipient and cancelled-bill SMS cancellation,
  restrictive merge preferences, archived bulk exclusion, explicit booking person.
- Reports/UI: read-only status with actual receipt collection, one draft banner,
  payment modes/balances, stable invoice label, complete Advance statement ledger,
  deeper cloud comparison and nested saved-report validation.
- Ortho/physio: dated attendance, strict calendar validation, recorded removal
  date, local/cloud duplicate session enforcement and workflow conflict checks.
- Backup: one shared restore/verifier schema validator, archive/reference/queue
  checks and explicit incomplete-coverage warnings.


Scope: source used for v2.0.100. Review only; no production code changes,
cloud writes, real messages, installer publication or patient edits were made.
Tests used temporary SQLite/PGlite databases and mocked transports. This report
does not replace physical owner-PC installation/printing/delivery verification.
Item 51 (PIN attempt lockout) remains excluded.

## Numbering and earlier findings

The earlier follow-up listed 57–64. Items 58 and 64 describe related cancellation
guards and belong to one repair group; they must not inflate the distinct count.

| ID | Finding | Evidence / proposed repair |
| --- | --- | --- |
| 57 | Cloud finance compares paid balance but not current net amount. A stale collection can exceed a remotely reduced bill. | PGlite accepted paid 500 on amount 100. Compare expected amount/discount and validate resulting balances at the write boundary. |
| 58, 64 | Ordinary Edit can reactivate cancelled bills; ordinary receipt normalization can retain Cancelled with positive paid; cloud finance can reactivate a remotely cancelled bill. | Local paymentLedger execution and PGlite reproduction. Explicit restore action and cancellation guards in every payment/edit path. |
| 59 | Finance collection RPC checks cash-day closure only when inserting a manual cash-book entry. | PGlite accepted a receipt on a closed day. Enforce closure for dated receipt changes too, with a consistent close/write locking protocol. |
| 60 | Billing status dropdown passes only id/status, but its hook requires expected_paid. | Billing.tsx / useDatabase.ts call contract. Use a valid operation and surface errors; status must agree with actual paid/net amounts. |
| 61 | Draft restore controls are inside each memoized bill row, and draft state is absent from memo dependencies. | Billing.tsx billRows. Render one independent control, including when there are zero rows. |
| 62 | Advance result/combined receipt omits payment mode; deposit/refund has no bill receipt lines. | Real financeApply on temporary SQLite: UPI deposit returns no mode. Persist/display mode and relevant resulting balances in the receipt result. |
| 63 | SMS uses long INV UUID while invoice PDF uses reserved BILL serial. | saveBillOffline.ts constructs SMS before allocation; invoiceNumber.ts. Derive customer-facing reference from the saved bill and retain permanent UUID as secondary reference. |

## Newly confirmed findings

### 65 — Newer local Advance can be overwritten during finance sync (high)

`src/lib/offlineSync.ts:172–193` captures latestQueue before awaiting the RPC and
uses that old queue to decide whether to clear pending flags. A second local
finance request created during the RPC is invisible to that decision.
`sqlite-store.cjs:178` protects a row by top-level queue.table/rowId/tempId and by
_pendingSync; it does not inspect patient mutations inside clinic_finance bundles.

Reproduced using the real sync function and temporary SQLite: queue Advance A,
create Advance B during A's mocked cloud call, acknowledge A. B remains queued
but the patient pending flag becomes false. A subsequent cacheMergeServer with
cloud A removes B from the visible local account. The queued B payload survives;
this is not a claim that its durable queued operation was deleted.

Repair: reread the queue after acknowledgement, match nested operations and
canonical IDs by table, and protect affected rows at the SQLite merge boundary.
Regression: delayed acknowledgement + second deposit + refresh + restart/replay.

### 66 — Mode correction turns Account Credit into fresh cash (high)

`src/lib/paymentLedger.ts:8` reclassifies all prior receipt modes, including
Account Credit. Real helper execution: a 500 Account Credit receipt contributes
zero fresh collections; editing the unchanged paid total to mode Cash adds an
Account Credit reversal and a Cash receipt. collectionRows then reports 500 new
income although no money arrived. Existing advance income can consequently count
again. Repair: preserve credit provenance and restrict mode correction to actual
monetary receipt entries; never allow an editor to convert credit application
into a cash receipt. Test mixed Cash/UPI/credit histories and monthly/cash reports.

### 67 — Queued bill SMS can go to an obsolete mobile (high)

`src/lib/offlineSync.ts:309` reads the current patient only for sms preference,
but sends the saved payload.mobile without comparing the current mobile.
Real runSync with a mocked sender dispatched an old-number bill SMS after the
patient's phone was corrected. Repair: validate patient identity and normalized
recipient immediately before dispatch; park stale jobs for review instead of
silently changing the recipient or sending old clinical details.

### 68 — Queued bill-saved SMS survives bill cancellation (medium)

The same dispatch path does not check the bill status. Real runSync dispatched
a queued bill_saved message for a Cancelled bill. Repair: cancel superseded
bill-saved jobs, with a reviewable reason; do not suppress legitimate refund or
payment history notifications merely because a bill is later cancelled.

### 69 — Patient merge drops the source's contact opt-outs (medium)

`patient-merge.cjs:16` merges account events but copies only the target's other
workflow settings. Temporary SQLite reproduction: source sms/whatsapp/marketing
all false, target unspecified; retained target has none of those false flags.
Repair: reconcile preferences explicitly in preview, default to the restrictive
setting, retain source decisions in audit and test queued messages after merge.

### 70 — Cloud reconciliation misses Advance and receipt-ledger differences (medium)

`src/components/CloudReconcile.tsx` compares patient name/mobile/BAOR and bill
amount/discount/paid. It omits workflow account events and payment_history.
Example: same patient identity, PC Advance 500, cloud Advance zero passes all
current patient comparisons. Equal total paid with different receipt dates or
modes also goes unnoticed. Repair: compare canonical financial ledgers/settings,
show field-level differences and distinguish pending work from verified equality.

### 71 — Backup verifier can approve malformed/incomplete backups (medium)

`backup-verify.cjs:3` validates table-row storage and supplied file checksums,
but does not run the actual restore's format checks or validate queued operations
and relationships. Real verifier accepted a version-3 object with no attachment
archive, queue [null], an orphan bill and discount greater than gross. This does
not mean the real restore necessarily accepts all those defects; the defect is
the verifier's false reassurance. Repair: share restore validation, validate
pending finance/message schemas, required references and arithmetic, and report
missing coverage separately from corruption. Perform isolated restore rehearsal.

### 72 — Patient statement lacks Advance transaction history (functional gap)

`patient-statement.cjs:35` shows wallet balance but does not put account events
in detailed payment history. Real buildStatement with deposit 500 and refund
200, no bills: wallet 300 displayed, payment history empty. Repair: show a
separate dated Advance ledger with mode, reason, application/refund and balance;
keep credit applications separate from fresh income. This is a reporting gap,
not a demonstrated wrong current wallet total.

### 73 — Invoice-number scope is stale after account switch (conditional bug)

`src/lib/patientRegistration.ts:79` returns early if the current account already
has more than eight numbers, before updating invoice-number:scope. Mocked new
session with OLD active scope and sufficient NEW pool kept OLD scope unchanged.
SQLite allocation uses that active scope, so it can consume the old pool.
Repair: verify/set active identity before the availability return, revalidate
identity after network requests, and ensure the main process enforces scope.
This requires account switching; ordinary use under one unchanged account did
not demonstrate a collision. Do not claim actual production duplicate numbers.

### 74 — Bulk campaign does not exclude newly archived patients (medium)

`outreach-service.cjs:14` excludes deleted_at but not workflow_data.archived;
festival audience does exclude archived patients. Mocked bulk campaign queued
for a patient, then archived before tick, still dispatched. Repair: make archive
semantics consistent in preview and dispatch, explicitly review exceptions for
transactional/payment notifications rather than blocking every channel blindly.

## Validation and intended next batch

The original SMS-offline regression suite also passed while additional mocked
reproductions were injected in memory. No test files or production files were
modified for these reproductions. Helper probes used real TypeScript functions;
merge/finance probes used real SQLite store functions in temporary directories.
Prior finance SQL probes used PGlite, never BJ BACKUP.

First repair the accounting/sync/cancellation group (57–59, 65–66), then recipient
validation (67–69), restore/reconciliation (70–71), followed by UI/report/number
scope issues. Use one coordinated additive cloud migration where needed and
regressions for the concrete cases above. No new update has been pushed as part
of this review; the user requested fixes together after the deep scan.

## Broader screen/workflow pass — additional findings 75–82

This pass expanded the review to patient registration/profile/search, booking
approval and appointments, Ortho/follow-up/recovery, physio, doctor commission,
delete/cascade, rate-list settings, report rendering, date handling and shared
read/write/authorization paths. Existing suites also cover login/session/access,
messaging, backup/attachments, report printing and offline mutations. This is a
source and synthetic workflow review, not an assertion that every possible UI
state or hardware integration has been exercised. Inactive legacy modules are
not a request to reintroduce IPD, medicine stock or prescription functionality.

### 75 — Booking approval matches family members by mobile alone (high)

`src/pages/BookingRequests.tsx`, confirmAndCreateAppointment, chooses the first
patient with matching last-ten phone digits without comparing req.patient_name
or offering a person selection. Executed the actual extracted handler against
temporary SQLite: existing Father Synthetic, incoming Daughter Synthetic with
the same mobile; the new appointment references the father. Repair: offer all
family matches, require an explicit person or create a new family member, then
commit the selected identity and request together. Never merge people by mobile.

### 76 — Ordinary Delete bypasses paid-bill refund/cancellation controls (high)

Billing's Delete calls useDeleteBill -> offlineDelete -> commitMutation delete.
Admin authorization allows this path; cascadeLocalDelete removes the bill and
its payment history without checking its paid balance or closed reporting days.
Reproduced an authorized deletion of a paid-500 bill in temporary SQLite.
Normal collection reports read billing receipts, so this removes the historical
receipt from those reports without a corresponding refund transaction. A server
deleted-record audit is not the same as preserving the monetary ledger. Repair:
retain financial history and route paid bills through explicit refund/void;
guard patient cascades and pending finance bundles, too. Test failed/retried
deletes and financial totals before/after. Do not remove audit/recovery copies.

### 77 — Cancelled X-ray bills still contribute doctor commission (medium)

`src/pages/DrReg.tsx` report loop does not exclude cancellation, and
`src/lib/doctors.ts` billCommission has no status guard. Executed real helper:
Cancelled X-Ray:1000, doctor percentage 20 gives commission 200, and the report
loop accepts it. Repair: share active-bill eligibility across screen/export/print
and test cancelled versus active bills. A policy change to receipt-based rather
than billed commission is separate and must not be silently assumed.

### 78 — Arrived follow-up is still labelled missed (medium)

`src/pages/FollowUps.tsx` records workflow_data.followup_state but filters due
cases only by Active plaster and old date; the missed label also only compares
the date. Executing those predicates with state 'आ गया' and yesterday's date
still returns an overdue/missed record. Ortho missed summaries similarly ignore
the attendance state. Repair: model attendance for the specific scheduled visit;
exclude attended visits from missed and reset the appropriate state when a new
visit is scheduled, while retaining historical attendance.

### 79 — Impossible calendar dates can be saved into the sync queue (medium)

`src/lib/offlineQuery.ts`, saveFollowUpDates, accepts YYYY-MM-DD plus finite
Date.parse, which normalizes some impossible dates. Executed the actual helper:
2026-02-31 was stored as next_followup_date and queued. Postgres date fields do
not accept that calendar date. Repair: strict component/roundtrip calendar
validation at every relevant write boundary; test leap years and invalid days.

### 80 — Historical plaster-removal reprint uses today's removal date (medium)

`src/pages/Ortho.tsx` handleRemove only saves plaster_status; printRemovalSlip
uses todayIso for removal date and elapsed treatment length. Executed actual
print helper with plaster start 1 Oct, historical removal 10 Oct, clock 31 Oct:
it prints removal 31 Oct and 30 treatment days. Even supplying removed_at does
not change the output. Repair: record an explicit immutable removal date for
new removals and reprint that date. Never invent missing historical dates;
show unknown/ask for an explicit correction separately from the print date.

### 81 — Concurrent physio saves bypass the duplicate-session guard (medium)

`src/lib/offlineQuery.ts`, offlineInsert, serializes by generated row UUID and
checks duplicates before the write. Two different UUIDs therefore use separate
chains. Promise.allSettled on two identical patient/plan/session inserts through
the real helper/SQLite bridge produced two successful records. Repair: enforce
uniqueness atomically using a stable course identity at local and cloud write
boundaries, not just a UI check; test double-click/concurrent clients/replay.

### 82 — Saving follow-up dates can overwrite a newer workflow note (medium)

saveFollowUpDates reads the case, then awaits other reads and writes a full old
workflow_data object without expectedWorkflow. Injected a separately saved
workflow note between the read and commit using the real helper: date save
removed that newer note. Repair: atomic field patch or revision-based conflict
check in local/cloud writes, preserving unrelated workflow fields. Regression:
attendance/note edit concurrent with date scheduling must survive or conflict.

## Extension of earlier item 55 — do not count as another independent item

`parseSavedReport` verifies JSON syntax and a top-level object, but not nested
field types. Actual parser accepted object-valued impression/findings; rendering
that value with ReactDOMServer raised 'Objects are not valid as a React child'.
The saved report dialog directly renders these values. Extend the old item-55
repair with schema validation and a per-report rendering boundary. A damaged
report must not bring down the screen; do not quietly discard clinical text.

## Verification for the broader pass

- All 37 Node regression suites declared in the Windows workflow passed locally.
- TypeScript typecheck passed.
- Production build passed (3,239 modules transformed). Bundle-size and existing
  configuration warnings are build warnings, not reproduced functional failures.
- Additional probes reproduced findings above using real extracted handlers,
  real helpers, temporary SQLite and mocked UI/senders; no actual SMS was sent.
- Previous successful Windows UI/installer checks belong to the release review;
  they were not rerun on the owner's physical PC during this scan.
- Only this review document is intentionally changed. Fixes, migrations and
  publishing remain deferred for the user's requested combined repair batch.
