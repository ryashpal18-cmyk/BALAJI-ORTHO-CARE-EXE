# PC पर बिना internet admin login

नई EXE में **Admin — Offline** चुनें। पहली बार **Admin banayein aur shuru karein** दिखेगा। Email में `ryashpal18@gmail.com` रखें और अपना चुना हुआ password दोनों boxes में भरें। यह account उसी PC पर बनता है; पहली बार भी internet जरूरी नहीं। Password source code, GitHub या installer में शामिल नहीं है।

**Is PC par login yaad rakhein** चालू रहने दें। App या PC restart करने पर dashboard अपने-आप खुलेगा। यह session 8/12 घंटे बाद expire नहीं होता। **Logout** करने पर saved automatic login बंद हो जाता है; अगली बार उसी password से login करें। इस सुविधा वाला Windows account केवल भरोसेमंद लोगों को दें।

Login की encrypted file और password verifier PC के Windows user से सुरक्षित हैं। Windows account बदलने या login file खराब होने पर recovery जरूरी हो सकती है। App login file को चुपचाप reset नहीं करती। पुरानी offline login file मौजूद हो तो पहले उसका account इस्तेमाल करें; नया setup उसे overwrite नहीं करता।

## Mobile / cloud sync

Local admin और Supabase admin अलग हैं। Internet आने पर app उसी email/password से cloud connection की कोशिश करती है और server पर admin role verify करती है। सफल connection पर pending data background में sync होता है। Account या server permission उपलब्ध न होने पर PC का login और local saves चलते रहते हैं; pending queue नहीं मिटती। Staff/cloud account इस local admin की जगह नहीं ले सकता।

**इस change से live Supabase account या admin role नहीं बनाया गया है।** Project `idcxmeczzfnipmybikue` में सही cloud account, admin role, `session-access` function और पहले वाली SQL migrations अभी भी sync की prerequisites हैं। केवल local login काम करने का अर्थ mobile sync verify होना नहीं है।

Sync के लिए EXE खुली रहनी चाहिए। App बंद होने पर pending data disk पर रहता है और अगली बार खुलने/connection मिलने पर कोशिश जारी होती है।

इस login update में patients, bills, dues, local SQLite database या उनकी queue को delete/reset नहीं किया जाता। Update से पहले सामान्य clinic backup बनाए रखें।

## Developer verification

- `node tests/offline-login.cjs`: encrypted local setup, wrong password/lockout, restart, logout, cloud identity/role verification, reconnect, legacy path migration and corrupt-file handling.
- `node tests/local-session.cjs`: renderer cloud gating and logout races.
- `node tests/auth-01.cjs`: offline UI entry without cloud waits and existing staff login checks.
- `node tests/offline-first.cjs`: durable local work and queue retained while cloud login is unavailable.
- `npm run typecheck` and `npm run build`.
