# Monthly clinic account PDF and WhatsApp automation (Windows EXE)

WhatsApp → **मासिक हिसाब PDF / Automatic WhatsApp**.

Save the report recipient's own/accountant phone number. It accepts a valid Indian mobile with optional +91. Explicitly enable the automatic checkbox and save. There is no default/inferred recipient and no automatic reporting until configured. Changing recipients/settings cancels queued/failed old-configuration monthly jobs. A message already handed to WhatsApp cannot be recalled.

## Report meaning

- Monthly billing: active bills created in the selected month, net of discount.
- Monthly collections: net dated receipt/correction entries in that month, including payments against older bills. India business dates apply regardless of PC timezone. Mode reclassification pairs cancel in net collections; negative entries are visible.
- Current outstanding: per-bill unpaid amounts across active bills at generation time, not a reconstructed historical month-end balance. Credits are shown separately and not transferred between bills.
- Patient names, phone numbers, IDs, per-patient amounts, month's bills, receipt details and mode totals are in the PDF. Shared family phones do not merge accounts.
- Date-less legacy payments and amounts not reconciled to detailed receipts appear separately; they are never guessed into a calendar month. This can make recorded monthly collections incomplete; warnings explain the missing evidence.
- Cancellation does not prove refund. Recorded receipts on cancelled bills remain visible with a warning, while cancelled bills are excluded from active billing/due totals.
- Reads use a consistent local SQLite transaction. Local/server aliases deduplicate with pending edits taking precedence. No cloud query/upload is performed, and full cloud/other-device equality is not claimed.

## Schedule and dispatch

On enabling/changing configuration the start month is the current India month. On the first day of the following month at 09:00 Asia/Kolkata the completed month becomes eligible. The existing 15-second PC worker checks while the app is open and admin logged in. If closed/offline/unpaired, eligible jobs wait/catch up when the app and WhatsApp connection are available. No OS service wakes a closed app. Re-enabling/changing recipient starts a new schedule from that current month; earlier historical reports can be generated manually.

No historic blast on first enable. Catch-up considers missed months since that configuration, enqueuing at most 12 new jobs per tick. A monthly job survives restart. Existing sent, queued, cancelled automatic and unconfirmed jobs prevent automatic duplicate creation for that month/configuration. A manual partial current-month report does not substitute for the later complete-month automatic report.

Before handoff the worker verifies the saved recipient/configuration, current report revision, admin state and live job state. Recipient changes or cancellations during PDF/number lookup stop stale dispatch. Ambiguous timeout/crash is unconfirmed and never automatically resent; review in the existing WhatsApp queue. Acceptance is not proof of recipient delivery/read. The report is sent to the one saved report number, not to the patients listed in the report.

Manual month preview, Open PDF, Save PDF and send-to-saved-number are available. Manual sending requires the preview revision/configuration to still match. Unsaved edited settings cannot be used to send. Future months are rejected; current month is marked partial.

## Validation

Synthetic SQLite financial, date-boundary, offline/restart, duplicate, recipient-change and timeout checks; Windows Electron multi-page PDF with 70 patients; actual React panel save/toggle/preview/PDF/error/send actions. No live patient database or WhatsApp recipient is used in tests. Real PC pairing, actual recipient delivery and printer output remain device checks.
