# पाँच क्लिनिक अपडेट

## 1. मैनुअल WhatsApp में सही मरीज का नाम

WhatsApp पेज पर editable draft में `[NAME]` placeholder रहता है। अंतिम preview
और Send के समय वर्तमान मरीज का नाम लगता है। मरीज A के बाद B चुनने पर A का
नाम नहीं रहता। `₹`, `$&` जैसे नाम के अक्षर substitution की तरह नहीं चलते।
Custom/edited draft को recipient बदलने पर reset करके सूचना दी जाती है; पहले
नंबर/मरीज चुनें, फिर संदेश संपादित करें। Manual नंबर डालने पर patient selection
हटती है और नाम के बिना “मित्र” आता है। 91 से शुरू होने वाले दस-अंक के भारतीय
नंबर में भी country prefix सही जोड़ा जाता है। यह manual Web composer है;
automatic PDF और text outboxes अलग हैं।

## 2. गाँव / filtered सूची को सीधे WhatsApp या SMS

Patient Search में गाँव, नाम या नंबर से filter लगाएँ → **चुने हुए गाँव / सूची को
WhatsApp या SMS भेजें**। पूरी filtered सूची ली जाती है, केवल 50 दिखाई देने वाली
rows नहीं। WhatsApp text, सामान्य SMS या दोनों चुनें और draft लिखें। `[NAME]`
का पहला resolved example और सभी recipient names/numbers preview में दिखते हैं।
Invalid/missing नंबर हटते हैं और shared family number हर channel में एक बार है।
त्योहार की opt-out सूची इन सामूहिक संदेशों पर भी लागू है।

Preview कोई message नहीं भेजता। Final button पर recipient count और channels
की पुष्टि के बाद durable local queue बनती है। एक request को बार-बार click करने
पर वही campaign मिलता है। नया preview/request बनाकर जानबूझकर नया campaign
भेजा जा सकता है। बदला हुआ नंबर/सूची/message पुराना preview स्वीकार नहीं करता।
भेजने से ठीक पहले recipient और campaign state फिर जाँची जाती है।

WhatsApp पेज पर **बकाया भुगतान पुष्टि और सामूहिक संदेश** में history/status,
pause, resume, cancel और uncertain-result review हैं। गाँव वाले panel में अपने
campaign की स्थिति भी दिखती है। हर 30 सेकंड में bulk attempt होता है; delivery
latency, connection और retry से अधिक समय लग सकता है।

## 3. बकाया जमा होने की automatic पुष्टि

अपडेट के बाद इस PC पर दर्ज नए positive due receipts के लिए WhatsApp text और
SMS की पुष्टि default ON है। WhatsApp पेज के इसी panel में ON/OFF और channels
बदल सकते हैं। संदेश में receipt date, इस भुगतान की राशि, invoice ID और उस
भुगतान के बाद का शेष बकाया है। पहले से मौजूद receipts पर install/enable के
कारण कोई backfill broadcast नहीं होता। नए bill का initial payment, refund,
mode-correction pair और दूसरे PC/cloud से आई receipt confirmation नहीं बनाते।

Receipt-origin marker payment के साथ उसी SQLite transaction में लिखा जाता है;
failed payment/audit transaction उसे rollback करता है। नए receipts को पहचानना
cloud sync या cloud log पर निर्भर नहीं है। SMS existing TextBee sender/journal
से और WhatsApp existing paired connector से जाता है। Missing gateway/session
का channel pending रहता है; दूसरा available channel आगे जा सकता है।

Pending/sent state और receipt identity SQLite में टिकते हैं। Restart के बाद
accepted SMS journal network resend रोकता है। Ambiguous WhatsApp handoff/crash
को unconfirmed रखा जाता है; कभी blind auto-resend नहीं। Sent/accepted मरीज तक
पहुँचने या पढ़ने की पुष्टि नहीं है। नई payment होने पर उसका अपना नया job बनता है।

## 4. फोटो/PDF सहित self-contained JSON backup

Settings → Backup → **फोटो सहित पूरा Backup**। Existing automatic daily/weekly
backup भी photo capture इस्तेमाल करता है। Patient/bill/queue records के साथ
referenced JPEG, PNG, WebP और PDF की असली base64 bytes, MIME, size और SHA-256
checksum JSON में रखे जाते हैं। Excel readable summary है; बड़े photo/binary
fields Excel cell में नहीं भरे जाते, पूरा डेटा JSON में रहता है। नया dependency,
SQL migration या data deletion नहीं है।

Embedded/queued images और clinic image-folder की local files offline ली जाती हैं।
Cloud files के लिए existing signed-link flow इस्तेमाल होता है, प्रति file bounded
20-second download और 64 MB file limit के साथ। Downloaded cloud bytes app के
local photo cache में verified रूप में रहती हैं, जिससे अगला backup/view offline
भी उनका इस्तेमाल कर सके। Signed token बदलने पर वही storage object cache मिलता
है। समान bytes deduplicate होते हैं। एक row की `_localFileUrl` copy remote alias
को offline पूरा कर सकती है। Root से बाहर local path, दूसरी storage origin,
HTML/error response या गलत MIME फोटो बनकर स्वीकार नहीं होते।

कोई file न मिल सके तो उसका source/error `attachmentFiles.missing` में और UI में
**आंशिक बैकअप** दिखता है। ऐसी file को बचा हुआ घोषित नहीं किया जाता। इंटरनेट बंद
होने पर केवल उपलब्ध local/cache records और photos शामिल हो सकते हैं; full-cloud
coverage का दावा नहीं है। JSON में patient data और photos हैं, इसलिए इसे clinic
backup के रूप में संभालें। Auth files और WhatsApp browser session की copy नहीं है।

Restore preview photo/missing counts दिखाता है। केवल खाली नए/test database पर
restore होता है; existing patients/pending work overwrite नहीं हो सकते। Checksum
न मिले तो database write से पहले restore रुकता है। Photos offline data references
में लौटती हैं। पुराने outgoing SMS/WhatsApp/bulk jobs को restore के बाद review के
लिए park किया जाता है, और restored historic receipts को नये confirmations नहीं
माना जाता। इससे पुराने backup से अनजाने दोबारा संदेश नहीं जाते।

## 5. त्योहार campaign का समय अनुमान

Preview में total recipients × channels, minimum duration और सबसे जल्दी पूरा
होने का समय IST में दिखता है। यह 30-second spacing पर lower-bound है; retry,
connection और दूसरे campaigns से समय बढ़ेगा। Saved campaign में pending count
और remaining minimum duration दिखती है। चुने हुए दिन के अंत से पहले minimum
भी पूरा न हो सके तो activation रोककर पहले समय/कम channels/कम सूची चुनने को
कहता है। पहले से मौजूद same-day expiry policy वही है।

## Verification

New suites: `message-and-estimate`, `outreach`, `receipt-origin`,
`attachment-backup`, `full-backup-roundtrip` and native `messaging-ui-electron`.
They cover recipient switching/country prefix, personalized preview, selected
village dedupe, idempotent queue/restart/pause/cancel, local-only due receipt
ownership, stale recipient checks, uncertain handoff, physical image cache,
checksum/partial backup, offline JSON restore and large-image Excel export.
Existing offline, billing, SMS, WhatsApp, due collection, diagnostics and festival
suites remain in Windows CI before EXE packaging. All transports and patients in
tests are synthetic; no real recipient was messaged or database restored.

Live account/handset delivery and a complete backup of the owner's actual photo
collection still require a device check after installing the resulting EXE.
