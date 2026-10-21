# PC family profiles and WhatsApp invoice PDF

Scope: Windows EXE only. No clinic data migration, record merging, public medical
portal, paid WhatsApp API or API credential was introduced. Equal valid normalized
Indian mobile numbers form a read-only family grouping. Each member retains their
own patient ID, bills, reports and fracture X-rays. Missing/invalid numbers are not
combined into a family. Canonical/local aliases are deduplicated. A new family
member can be registered through the existing explicit OPD new-member flow.

Family Profiles is available in the sidebar and each patient profile. Bill PDFs
are produced locally by an isolated, sandboxed Electron PDF renderer using data
read from SQLite, validated financial amounts, escaped text and an embedded QR.
The QR uses balajiclinic://family/<patient-reference>; the Windows installer
registers this protocol. It opens the logged-in administrator's clinic software.
It does not expose records in a patient's phone browser. Patient-facing access
requires a separately authorized portal and verified access design.

WhatsApp page: choose Connect, then use the phone's Linked devices scanner.
The pinned whatsapp-web.js connector manages WhatsApp Web through a separate
Chrome/Edge profile. Chrome or Edge must be installed. No paid API key is needed.
This is not an official WhatsApp API integration; Web changes can require a
connector update/reconnection. The app, internet and paired session must be active.
LocalAuth/session files stay under clinic-messaging/whatsapp-auth in app userData,
outside clinical export snapshots. Browser download is skipped in CI; packaged
production dependencies include the connector and QR encoder.

New bills created after the messaging module's first start are automatically
queued. Existing historical bills are not bulk-messaged on upgrade. A bill's
WhatsApp button queues that bill's latest PDF manually. A changed bill can be
queued as a new revision; duplicate calls for the same revision reuse one job.
Unsent revisions are replaced rather than sent twice. Job state persists in
SQLite metadata, independent of cloud login/logging. Financial data and mobile
are checked again before handoff; PDF generation never accepts arbitrary renderer
HTML or file paths. A logout/expired admin stops worker authorization.

Sending is durably marked before the Web call. Missing acknowledgment, timeout,
crash during sending or post-handoff save failure becomes unconfirmed, never an
automatic resend. The WhatsApp page provides explicit review/retry/cancel actions.
Sent means WhatsApp returned a message identity, not patient delivery or reading.
Invoice PDF generation/storage failure leaves the bill saved and job pending.
No production recipient was messaged or WhatsApp account connected during coding.

Validation: existing 12 regression suites plus new SQLite-backed family/queue
checks; typecheck and production bundle. CI also runs a genuine Electron PDF
smoke test with synthetic data, embedded QR and output PDF checks. Required device
acceptance: scan the owner's QR, send one consented test PDF, confirm receipt,
restart without duplicate, create offline bill and reconnect, follow a QR on the
installed PC, and review an uncertain message. Full on-device success is not
inferred from CI alone. Install as an update and retain the existing clinic data.
