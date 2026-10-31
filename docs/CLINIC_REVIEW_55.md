# EXE review: 55 retained items

Scope: items 1–56 from the clinic review, excluding item 51 (PIN attempt lockout).
No attempt-count lockout was added. Item 50 fixes entering a complete 4–6 digit PIN.

This is an implementation and verification record, not a claim that live delivery
or installation on the owner's Windows PC has been witnessed. Existing functions
were retained and regression checked. Synthetic recipients and temporary databases
were used; no real SMS or WhatsApp was sent.

## Deployment prerequisite

`docs/CLINIC_FINANCE_SETUP.sql` adds workflow columns, invoice numbers, owned rate
settings, and an authenticated, RLS-respecting, idempotent finance transaction RPC.
The SQL was tested with PGlite for transaction rollback, duplicate requests,
concurrent/stale balance rejection, invoice reservation replay and auth rejection.
Apply and verify this setup before releasing the new EXE to users. A review branch
build produces an artifact without publishing an auto-update release. Main builds
retain the existing installer/release workflow.

The first Supabase migration confirmation expired; that attempt did not apply it.
Cloud setup and live-device verification are separately tracked below.

| Item | Implementation / evidence | Remaining external verification |
| --- | --- | --- |
| 1 | Existing WhatsApp recovery retained; messaging-recovery tests | Owner PC browser/session |
| 2 | Local bill/PDF outbox retained; original payment QR added to unpaid PDF | Real paired handset delivery |
| 3 | Pending, accepted and uncertain SMS remain distinct; no fabricated delivery result | Review historical gateway results |
| 4 | Durable SMS journal and uncertain WhatsApp parking; replay tests | No blind resend of old jobs |
| 5 | Bounded requests/schema backoff retained; new schema and CAS conflicts have explicit errors | Fresh owner-PC HTTP-400 diagnostic needed; old errors are not evidence of current failure |
| 6 | Settings → Cloud Sync → read-only PC/cloud ID and amount comparison | Run against installed PC; cloud snapshot during review: 1,146 patients, 1,302 bills, 736 SMS logs |
| 7 | Existing startup/relaunch maximize fix retained | Installed Windows EXE |
| 8 | Existing durable BAOR allocation retained; directory search/display expanded | Owner's printed letterpad alignment |
| 9 | Both existing letterpad modes retained; print regression suites | Actual printer calibration |
| 10 | Receipt-date ledger retained; dashboard Quick Pay uses incremental receipt dialog | Existing historic payments are not assigned invented dates |
| 11 | Recipient-aware manual draft retained; personalization tests | None at source level |
| 12 | Village filtering, full filtered audience and family-number dedupe retained | Live campaign only after owner action |
| 13 | Local-origin payment confirmation retained; Account Credit is not called fresh cash | Live SMS/WhatsApp acceptance |
| 14 | Existing festival ETA/pause/cancel retained; contact preferences enforced at dispatch | Actual network timing is variable |
| 15 | Monthly PDF retained; advances/refunds included and applied credit excluded from fresh income | Real recipient delivery |
| 16 | Patient statement and individual receipts retained; combined finance receipt added | None at source level |
| 17 | Offline login/registration/billing tests retained | Install/start on owner PC |
| 18 | Independent SMS/data drains retained; stale cloud balance cannot silently overwrite newer payment | Reconnect owner PC and inspect conflicts |
| 19 | Existing full-backup roundtrip and attachment checks retained | Owner's selected real backup |
| 20 | Existing data-preserving update/storage paths retained; new modules/assets explicitly packaged | Windows installer upgrade test |
| 21 | Durable scoped bill draft, explicit restore/discard, no messaging from drafts | Synthetic UI/Windows checks |
| 22 | Original supplied Google Pay QR embedded in an additional unpaid-bill PDF page, clearly distinct from Family QR | Scan printed PDF with handset |
| 23 | 0–7 / 8–30 / 31–90 / 90+ day filters and oldest-first ordering | None at source level |
| 24 | Due promise date, collection note and last queued SMS reminder timestamp | User-entered promise remains optional |
| 25 | Due page links patient statement/PDF/WhatsApp; unpaid statement includes payment QR | Live delivery |
| 26 | Patient Profile → combined payment, oldest bills first, one receipt group; atomic local/cloud bundle | Requires cloud setup |
| 27 | Advance deposit, balance, application to bills, cash book entries; no income counted twice | Requires cloud setup; advances support Cash/UPI |
| 28 | Advance refund and bill refund with reason/date/mode; negative receipts retained | Requires cloud setup |
| 29 | Follow-up arrival/missed state, timestamps, next dates and selected-patient messaging | Live reminder sending |
| 30 | Patient/receipt views show queued/error/verified upload status; absence of a stamp does not claim verified cloud data | Existing legacy rows need read-only comparison |
| 31 | Separate SQLite-in-memory backup verification, counts, financial totals and attachment checksums | Owner-selected backup; never overwrites active DB |
| 32 | Collect Payment supports Cash + UPI split with separate receipt entries | Requires cloud setup for atomic bundle |
| 33 | BAOR directory search and visible registration number | None |
| 34 | Complete paginated audit fetch, date filters and UI paging; 300-row cutoff removed | None |
| 35 | Optional registration phone; no fake number or SMS is required; local PDF works without a phone | Cloud mobile column verified nullable |
| 36 | Human BILL-000001 number distinct from permanent UUID; reserved offline pools and replay-safe cloud reservations | Requires cloud setup/first reservation; full reference remains available |
| 37 | Rate list cloud upload and explicit reviewed import on another EXE; local backup retained | APK needs its own client support for this new settings table |
| 38 | Session/total/pain ranges and duplicate-session guard at write boundary | New course must use a distinct plan |
| 39 | Exact-name/phone duplicate preview, target BAOR confirmation, atomic relinking, source archived; family members blocked | Requires cloud setup; no real patients merged during tests |
| 40 | Archive/reactivate preserves bills, due and history; archived patients can be shown in directory | Requires workflow columns for cloud persistence |
| 41 | Per-patient SMS/WhatsApp/marketing preferences; dispatch checks current preference | Requires workflow columns for cloud persistence |
| 42 | Reasoned cancellation available in patient finance; refund first if paid; cancelled bills excluded from due/revenue totals | Requires cloud setup |
| 43 | New bills capture immutable demographic snapshot for reprint; original reference retained | Original pre-update demographics cannot be reconstructed if never saved |
| 44 | Ctrl+Shift+F search, Ctrl+Shift+B billing, Ctrl+Shift+R registration; no typing-triggered save shortcut | Windows keyboard check |
| 45 | Monthly and today's billed-patient count uses distinct canonical patient IDs | Counts represent billed patients, not all registrations |
| 46 | Analytics load failures display an error/retry instead of false zero | None |
| 47 | Cash Tally and Billing show gross, discount and net separately | Printer check |
| 48 | Age zero preserved in legacy print/edit/AI display fields | None |
| 49 | Legacy OPD free text escaped before HTML rendering; existing sanitization retained | None |
| 50 | Complete PIN entered before explicit Unlock; four digits do not prematurely reject a six-digit PIN | Native UI test; no lockout added |
| 52 | Service revenue derived from each actual line amount, not equal bill division | None |
| 53 | Due totals based on actual net balance; cancelled records excluded consistently | Existing corrupt legacy balances remain visible for review |
| 54 | Dashboard Quick Pay shares the incremental Collect Payment dialog | Native receipt UI |
| 55 | Malformed saved-report JSON is isolated with a readable error | None |
| 56 | Revenue date recomputes on IST day change/focus; no new bill required | Native timing/focus |

## Important limits

- The owner's Windows PC and physical SMS/WhatsApp delivery were not accessed.
- QR is the original provided payment image; seeing/scanning it never marks a bill paid.
- New finance/merge actions are explicit administrator operations. Merely installing
  the update never merges patients, refunds money, or sends historical campaigns.
- Atomic financial cloud requests are owner-authenticated, preserve RLS, lock rows,
  reject stale balances and use durable request IDs. A cloud conflict remains queued
  for review rather than rewriting someone else's later receipt.
- Restoring backups discards invoice-number reservation leases to prevent reuse.
- The review branch must not publish an automatic update before cloud setup is verified.

## Local validation

All 37 Node regression suites in the workflow passed, including the new finance SQL
and 11 review scenarios. TypeScript and production Vite build passed. Native
Windows UI/PDF tests are run by the review-branch GitHub Actions job.
