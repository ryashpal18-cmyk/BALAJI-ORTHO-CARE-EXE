# त्योहार शुभकामनाएँ — Windows EXE

Sidebar → **त्योहार शुभकामनाएँ** (Admin only).

1. दीपावली, होली, रक्षाबंधन, नवरात्रि, दशहरा, धनतेरस, भाई दूज,
   जन्माष्टमी, गणेश चतुर्थी, मकर संक्रांति, नव वर्ष, ईद, क्रिसमस या अन्य त्योहार चुनें।
2. हर साल सही तारीख और शुरू होने का समय भरें (भारत / IST)। धार्मिक कैलेंडर
   की तारीखें अनुमान से नहीं लगाई जातीं; recurring annual dates नहीं हैं।
3. WhatsApp text, सामान्य SMS या दोनों चुनें। तैयार हिंदी संदेश बदल सकते हैं।
4. Preview में अंतिम संदेश, सभी प्राप्तकर्ता, अलग नंबरों की संख्या और हटाए नंबर देखें।
5. **अभियान सेव करें** दबाने पर यह अधिकृत अभियान बनता है। तय समय पर PC,
   software और admin session चालू हो तो background worker भेजना शुरू करेगा।

No campaign, recipient or schedule is enabled by installing the update. No live
messages were sent during implementation or tests. Patient names, diagnoses, bills
and dues are not interpolated into greeting text. Existing bill/PDF and monthly
report behavior is unchanged.

## Sending and recipient rules

- Read the current local patient directory, including offline patients. Deduplicate
  normalized Indian mobile numbers, skip invalid/missing numbers, and respect
  locally saved greeting exclusions. One shared family number gets one greeting
  per selected channel. SMS + WhatsApp intentionally creates two messages/number.
- Preview binds message, schedule, channels and audience via a fingerprint. Changing
  these or changing the recipient list requires a fresh preview before activation.
- Each saved campaign snapshots its recipients. New patients added after saving
  are not silently appended. Removed numbers and new exclusions are checked again
  by the worker before selecting a recipient. Add exclusions as one number per line,
  10 digits or +91 prefix without spaces inside the number.
- One selected festival + IST date + overlapping channel cannot be activated twice.
  Cancelling an entirely unsent campaign allows creating a corrected replacement.
- Uses the existing QR-paired WhatsApp Web client for **plain text**; no PDF or
  manual search/attachment/Send click. Chrome/Edge and the paired session are needed.
  The connector is not the official WhatsApp Business API; a Web change can require
  reconnecting/updating. No claim of guaranteed account eligibility or delivery.
- SMS uses the existing TextBee gateway, SIM and durable acceptance journal.
  Compiled Vite gateway credentials are passed to main memory after admin access
  checks and never stored in campaign metadata or exposed by festival status.
  A missing SMS configuration keeps SMS waiting, while WhatsApp may proceed.
- The worker attempts one greeting every 30 seconds, including retries. It polls
  every 5 seconds. Disconnected WhatsApp does not block an available SMS job.
  A 100-number campaign with both channels needs at least about 100 minutes.
- Only sends during the selected IST calendar day. Queued messages expire after
  that day, including offline/restart backlogs, to avoid late seasonal greetings.
  Plan the start time accordingly. The screen states this expiry rule.
- Pause/resume/cancel affects messages not already dispatched. In-flight messages
  cannot be recalled. History and per-number/channel state remain visible here.
  Festival SMS history is in this page, separate from the existing bill SMS Logs.
- Accepted/Sent is not proof of patient delivery/read. Uncertain WhatsApp handoff,
  timeout or crash becomes `unconfirmed`, never an automatic resend. SMS restart
  recovery consults the existing idempotent gateway journal. Review can mark a
  message as found in chat/gateway or cancel it; this screen does not blindly retry
  an uncertain message.
- Campaign settings, snapshots and progress are durable local SQLite metadata;
  cloud login is not a dependency. Only authorized admins may activate/read/review
  campaigns. Greeting exclusions do not change patient records or bill messaging.

## Verification

`node tests/festival-messaging.cjs` exercises templates, IST, normalized duplicate
numbers, stale preview, scheduling, pause/cancel, exclusion/removal, disconnected
channel independence, restart, expiry, uncertain results, SMS idempotency and the
actual paired client's plain-text path using fake transports. The 7 interactive UI checks also passed in a local DOM harness. Native Electron
execution on this host was blocked by its display/process environment; the
Windows workflow runs the native UI test. Also run existing
`pc-family-whatsapp`, `sms-offline` regressions, typecheck and production build.

Live acceptance remains a device check after installing the resulting EXE:
preview the list, connect the owner's WhatsApp and verify a deliberately chosen
test recipient before activating any real campaign. No actual patient credentials,
phone delivery or WhatsApp account was used in tests.
