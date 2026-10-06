# बग 1–20: सिर्फ आवश्यक बदली हुई फाइलों का patch

प्रोजेक्ट: Balaji Digital X-Ray & Ortho Care Center — source version 2.0.41
आधार: आपके दिए BALAJI-ORTHO-CARE-EXE-main (2).zip की पहली 20-बग रिपोर्ट।

**नंबर 1 भी ठीक है:** hardcoded credentials, Quick Login/autofill और local admin bypass हटे। Admin अपने Supabase Auth email और निजी password से login करेगा। यह source patch है, तैयार Windows EXE नहीं।

## Admin login तैयार करें — नया EXE लगाने से पहले

- सही Supabase project के Authentication → Users में अपना admin account चुनें; पुराना प्रकाशित password बदलें। यदि account नहीं है तो dashboard से अपने email और नए निजी password के साथ बनाएँ। कोई password source code में न डालें।
- उसका User UID कॉपी करके SQL Editor में नीचे UID बदलकर चलाएँ (पहले user की पहचान सत्यापित करें):

```sql
insert into public.user_roles (user_id, role)
values ('REPLACE_WITH_ADMIN_USER_UUID'::uuid, 'admin')
on conflict (user_id, role) do nothing;
```

- नीचे की migration और दोनों functions deploy करने के बाद नए ऐप में पूरा admin email और नया password भरें। ऐप अब खुद admin account नहीं बनाता।
- Admin और staff, दोनों को हर नए login/app restart पर internet चाहिए। सत्यापित चालू desktop session अधिकतम 8 घंटे offline चल सकता है। Online रहते permissions पुनः जाँची जाती हैं।
- पुराने स्थानीय auth.json और उसकी .bak हटते हैं; उससे अब login स्वीकार नहीं होता। पुराने अलग backups और Git history में पहले प्रकाशित password रह सकता है, इसलिए password बदलना आवश्यक है। इस patch से live password स्वतः नहीं बदलता।


## कैसे लगाना है — इसी क्रम में

1. ऐप बंद करें और मौजूदा source folder तथा clinic database/backup की अलग सुरक्षित copy रखें। पुराने project की उसी 2.0.41 source copy पर यह patch लगाएँ।
2. ZIP खोलें। इसकी files/folders को उस source folder में **merge/replace** करें जहाँ main.js और package.json हैं। पूरा src या supabase folder हटाएँ नहीं। बाकी project files, images और dependencies पहले वाले project से ही रहेंगी।
3. ऐप के वास्तविक Supabase project में SQL Editor से `supabase/migrations/20261005150000_fix_report_02_20.sql` चलाएँ। यह मौजूदा migrations के बाद लगती है। इसे सही project पर एक बार लगाना जरूरी है; इसे दोबारा चलाने का test भी किया गया है।
4. उसी project पर दोनों server functions deploy करें: `create-admin-user` और `session-access`। Source client और auth-public-config.json में project `idcxmeczzfnipmybikue` है। पुराने supabase/config.toml का project इससे अलग हो सकता है, इसलिए CLI में target स्पष्ट दें:

```sh
supabase functions deploy create-admin-user --project-ref idcxmeczzfnipmybikue
supabase functions deploy session-access --project-ref idcxmeczzfnipmybikue
```

5. Supabase में मौजूदा admin Auth account और उसका `user_roles` में admin role उपलब्ध होना चाहिए। पहली बार admin account बनाने के लिए Supabase Dashboard का अधिकृत administrator उपयोग करे। अब बिना admin अधिकार वाला public endpoint नया admin नहीं बना सकता। Service-role key को app/.env में न डालें; functions में server environment वाली key ही रहती है।
6. पुराने केवल-local staff accounts को Settings → Users से उनके username के साथ cloud account के रूप में फिर बनाएँ। कम से कम 8-character password दें और pages चुनें। नया staff login अपने Supabase session से चलता है। **Staff login के समय इंटरनेट चाहिए।** सफल login के बाद चालू desktop session में अधिकतम 8 घंटे offline काम हो सकता है; app restart पर फिर login होगा। Online रहते हुए permissions दोबारा जाँची जाती हैं।
7. Source folder में dependencies और नया EXE बनाएँ:

```sh
npm install
npm run build
npm run dist
```

Windows पर EXE बनाना/जाँचना उचित है; SQLite native dependency Electron के लिए rebuild होती है। पुराने installed EXE के पास केवल TSX files copy करने से बदलाव लागू नहीं होते। नया build लगाना पड़ेगा। मौजूदा package-lock में पहले से dependency mismatch था, इसलिए यहाँ npm ci नहीं दिया गया है।

## किस नंबर में क्या बदला

| नंबर | बदलाव |
|---|---|
| 1 | Fixed password, preset/autofill और local admin bypass हटे; admin/staff server-verified sign-in और failure पर session cleanup। |
| 2 | Server function caller का token और admin role जाँचता है; role बनना असफल हो तो नया Auth user वापस हटता है। |
| 3 | Staff अपने cloud account से sign-in करता है; पिछला admin session reuse नहीं होता। Staff create/delete/page-permissions server पर जाते हैं। |
| 4 | Direct routes और main-process IPC पर permissions; unknown role admin नहीं; server पर restrictive page/branch RLS। पुरानी session query cache account switch पर साफ होती है। |
| 5 | Cache और mutation queue एक SQLite transaction में सेव। Commit पूरा होने पर ही UI सफलता; false IPC results/errors caller तक पहुँचते हैं। |
| 6 | Sync हर mutation का ताजा queued ID पढ़ता है; local insert के बाद delete real server ID पर पहुँचता है; deleted row cache refresh से वापस नहीं आती। |
| 7 | एक रिकॉर्ड के read/merge/save एक ही serialized chain में। पुराने insert को in-flight बदलने के बजाय updates अलग queue होते हैं। |
| 8 | Legacy import की success जाँची जाती है; failed read/import पर migration रुकती है। पुरानी IndexedDB source अपने-आप कभी delete नहीं होती। |
| 9 | X-ray पहले durable queue में जाता है; parent IDs resolve होने तक प्रतीक्षा; upload UUID/path स्थिर और retry-safe upsert। |
| 10 | हर भुगतान का amount, receipt time, mode और stable event ID bill के payment_history ledger में रहता है। Cashbook receipt date से collection बनाती है। |
| 11 | सभी operational tables की coverage, एक consistent local SQLite snapshot, pending queue और Ortho visit notes JSON में। Missing/offline tables की warnings; खाली नई/test database पर restore। |
| 12 | Full sync/backup में paginated downloads; छोटी/filtered सामान्य fetch से पूरा cached table नहीं मिटता। |
| 13 | सफल complete authenticated refresh का empty result स्वीकार होता है; pending local records और deletes सुरक्षित रहते हैं। |
| 14 | Network check पुराना status नहीं बदलता; polling अब offline→online बदलाव पकड़ती है। |
| 15 | 10-digit और 12-digit भारतीय मोबाइल अलग पहचानकर country code लगता है; 91 से शुरू 10-digit नंबर भी सही। |
| 16 | Due Amount नाम खोज में खाली digit string सभी mobiles से match नहीं होती। |
| 17 | जरूरत से ज्यादा stock-out reject; local stock+movement+queue atomic; server RPC locking और stable movement ID से retry-safe adjustment। |
| 18 | Prescription Pad में patient search और save दोनों offline-aware; save durable queue में जाता है। |
| 19 | Business date Asia/Kolkata में; प्रमुख daily grouping, date inputs और followups UTC date cut से अलग। |
| 20 | Patients, billing, appointments और उनके search/dashboard queries में चुनी branch की filtering तथा अलग query keys; new records में branch relation। |

## उपयोग में ध्यान देने वाले बदलाव

- Branches में “All Branches” देखने के लिए है। नया patient बनाने से पहले branch चुनें; केवल एक active cached branch हो तो वही स्वतः लग सकती है। Billing/appointment मरीज की branch लेते हैं। पुराने unassigned records migration में पहली existing branch से जोड़े जाते हैं; कई branches हों तो administrator यह mapping जाँचे।
- Staff की `staff_access.allowed_branches = NULL` का अर्थ clinic की सभी branches का अधिकार है। किसी staff को सीमित करना हो तो administrator उस column में permitted branch UUIDs की array सेट करे। चुना हुआ branch filter अपने-आप security entitlement नहीं बनता।
- पुराने bill की रकम कब-कब जमा हुई थी, यदि उस समय ledger था ही नहीं, तो वह इतिहास वापस बनाया नहीं जा सकता। ऐसी पहले से जमा रकम पुराने bill date पर legacy opening receipt है; patch के बाद की नई installments अपनी असली तारीख पर जाएँगी। Negative correction अलग receipt event बनती है। पहले से closed cashbook day का frozen snapshot अपने-आप नहीं बदला जाता।
- Backup JSON में image URLs और pending X-ray upload bytes हैं। पहले से cloud/local folder में रखी सारी image/PDF binary files डाउनलोड करके archive नहीं की जातीं; storage buckets और xray_images folder की copy अलग रखें। Auth users/passwords का restore Supabase administration का अलग काम है। JSON की coverage/warnings पढ़ें; offline/missing-table backup को पूरा cloud export न मानें।
- Restore जानबूझकर खाली SQLite database पर ही चलता है। भरी database में “merge restore” नहीं करता। वर्तमान pending work को बचाए बिना reset/delete न करें।
- अलग machines पर offline stock-out के बीच stock समाप्त हो जाए तो server conflicting adjustment reject करेगा; वह pending/error review माँगेगा। वास्तविक stock negative करने के लिए auto-clamp नहीं होगा।
- Browser preview में durable offline store नहीं मिलता तो save success का झूठा दावा नहीं होता; यह patch मुख्यतः Electron desktop ऐप के लिए है।

## क्या जाँचा गया

- नंबर 1 login regression: admin/staff login, invalid password/role, desktop verification failure, migration failure cleanup और local bypass denial सफल। Tests repository के tests/ folder में हैं; Node 22.13+ पर node tests/auth-01.cjs और node tests/report-02-20.cjs चलाएँ।

- Production Vite build सफल। Main/preload/SQLite/access-control JavaScript syntax checks सफल।
- 18 targeted regression tests सफल: commit wait/rollback, IPC failure, concurrent update, insert/delete sync, safe migration, X-ray IDs/retries, payment dates, pagination, backup/restore, mobile, network polling, admin endpoint, IPC permissions और branches।
- SQLite transactions का परीक्षण असली SQLite engine (Node node:sqlite adapter) में; production better-sqlite3 Windows native binding का इस Linux environment में end-to-end परीक्षण नहीं हुआ।
- अलग PostgreSQL-compatible PGlite database में मूल migrations + नई migration सफल; rerun, stock rollback/idempotency, receipt idempotency और staff RLS परीक्षण सफल।
- Browser में 9 बदली हुई screens का mocked offline smoke test सफल। Due name search, branch-filtered patient search, वास्तविक Prescription Save button से offline queue और forbidden direct route की रोक जाँची गई। Live network requests इन tests में रोकी गईं।
- Full TypeScript check अभी साफ नहीं है: पहले से मौजूद UI-library exports, generated database types और कुछ दूसरे modules के diagnostics बाकी हैं। Vite build इन्हें type-check नहीं करता। यह ZIP बाकी अनचाहे refactors या पूरी नई full-system audit का दावा नहीं है।
- Live Supabase deployment, असली staff credentials, Windows EXE, SMS delivery, printer और वास्तविक multi-machine use यहाँ नहीं चलाए गए। **Source fixes देने का अर्थ live installation पूरा होना नहीं है।**

## लगाने के बाद छोटा acceptance test

1. Offline patient/bill सेव करके ऐप बंद/खोलें; फिर online sync करें।
2. Offline बनाया patient delete करके sync करें; server पर वह नहीं रहना चाहिए।
3. Staff से प्रतिबंधित route खोलें; access denied मिले। उसके अपने permitted page से cloud sync जाँचें।
4. पुराने bill में आज की installment दें; आज की cash/UPI collection अलग दिखे।
5. Stock 5 में से 10 निकालें; save reject हो। Stock 5 में से 2 निकालने पर 3 और एक −2 movement रहे।
6. Offline patient+case+X-ray जोड़ें; online होने पर सही रिश्ते जुड़ें और retry से duplicate न बने।
7. Branch बदलें; patient/bill list अलग हो। Backup लेकर खाली test database में restore तथा queued work/notes जाँचें।

## ZIP की सामग्री

नीचे केवल बदली/नई runtime files हैं। node_modules, dist, images, .env और पूरा project शामिल नहीं है। Tests की dependencies भी ZIP में नहीं हैं। PATCH-FILES.sha256 में हर runtime file का checksum है।

- `access-control.cjs`
- `auth-public-config.json`
- `electron-builder.yml`
- `main.js`
- `preload.js`
- `sqlite-store.cjs`
- `src/components/AppSidebar.tsx`
- `src/components/DashboardLayout.tsx`
- `src/components/ProtectedRoute.tsx`
- `src/components/ortho/OrthoPanel.tsx`
- `src/hooks/useAppointmentReminders.ts`
- `src/hooks/useDatabase.ts`
- `src/hooks/useInventory.ts`
- `src/hooks/useOrtho.ts`
- `src/hooks/useSmartNotifications.ts`
- `src/lib/appConfig.ts`
- `src/lib/backup.ts`
- `src/lib/branchContext.tsx`
- `src/lib/branchData.ts`
- `src/lib/businessDate.ts`
- `src/lib/completeFetch.ts`
- `src/lib/mobile.ts`
- `src/lib/offlineDb.ts`
- `src/lib/offlineQuery.ts`
- `src/lib/offlineSync.ts`
- `src/lib/paymentLedger.ts`
- `src/lib/queryClient.ts`
- `src/main.tsx`
- `src/pages/Billing.tsx`
- `src/pages/BookAppointment.tsx`
- `src/pages/CashTally.tsx`
- `src/pages/DailyCashBook.tsx`
- `src/pages/DueAmount.tsx`
- `src/pages/Login.tsx`
- `src/pages/MedicineCommission.tsx`
- `src/pages/OPD.tsx`
- `src/pages/Ortho.tsx`
- `src/pages/PlasterSync.tsx`
- `src/pages/Prescription.tsx`
- `src/pages/RevenueDashboard.tsx`
- `src/pages/SettingsPage.tsx`
- `src/services/smsService.ts`
- `supabase/functions/create-admin-user/index.ts`
- `supabase/functions/session-access/index.ts`
- `supabase/migrations/20261005150000_fix_report_02_20.sql`


## 6 अक्टूबर 2026: दूसरे audit के F01–F16 सुधार

इस update में offline update क्रम, pending-delete cache, staff queue ownership/branch access,
write-only audit RPC, Cash/UPI correction receipts, authorized delete acknowledgement और sync lock सुधारे गए हैं।
Clinical child tables/storage में active staff व patient branch जाँच है। Closed cash day को staff reopen नहीं कर सकता।
Prescription/invoice/report links private signed links हैं; invoice resend नया PDF/link बनाता है और Reports download link renew करता है।
Generated print/PDF HTML sanitize होता है; mobile prefix व discounted dashboard balance सुधारे गए हैं।
TypeScript की 22 errors हटाई गईं और EXE workflow में typecheck gate जोड़ा गया है।

### Deploy करना जरूरी है
1. Database backup लें। पहले `20261005150000_fix_report_02_20.sql` लागू होना चाहिए।
2. Supabase SQL Editor में `supabase/migrations/20261006120000_fix_deep_audit_f01_f16.sql` लागू करें।
   GitHub push अथवा EXE build इसे अपने आप live database में लागू **नहीं** करता।
3. पहली patch के `session-access` और `create-admin-user` Edge Functions भी deploy रहने चाहिए।
4. नया EXE सभी PCs पर लगाएँ। पुराने versions नई audit/delete RPC व्यवस्था के अनुकूल नहीं हैं।
5. पुराने queued records जिनका verified owner नहीं है, admin login से sync करें; staff को दूसरे user की queue नहीं दिखाई जाएगी।

### Cash book और PDF व्यवहार
- Cash book का historical schema clinic-wide है। इसलिए collection, expenses और closing सभी branches के हैं;
  header पर All Branches लिखा है। Branch-limited staff को यह clinic-wide page नहीं मिलेगा।
- Cash/UPI correction पुराने receipt की तारीख पर reversal/reclassification जोड़ता है। पहले बंद किए दिन की
  saved closing snapshot नहीं बदलती; जरूरी हो तो admin कारण लिखकर reopen करके जाँच करे।
- नए invoice/prescription/report sharing links 24 घंटे के हैं। Expire होने पर नया link share करें।
  पुराने public invoice links private bucket होने के बाद काम नहीं करेंगे। पहले जारी signed links अपनी expiry तक चल सकते हैं।
- खाली beds जिनमें patient नहीं जुड़ा है, केवल clinic-wide staff/admin देख सकते हैं।

### Verification
`npm run typecheck`, `npm run build`, `node tests/report-02-20.cjs`, `node tests/auth-01.cjs`,
`node tests/deep-audit.cjs` पास किए गए। `tests/deep-audit-sql.cjs` isolated PostgreSQL-compatible
PGlite में migrations, RLS, audit, stock, payment और cash-day protection जाँचता है।
Browser में invoice XSS payload inert रहा और 9 screens/permission/offline prescription checks पास हुए।
Windows EXE और live Supabase का end-to-end परीक्षण यहाँ नहीं किया गया है।


## 6 अक्टूबर 2026 शाम: PC-first sync और N01–N07

- Patient/billing आदि के local commit में row और queue एक SQLite transaction में रहते हैं। Save सफलता तभी लौटती है जब PC का commit सफल हो।
- Ortho edit भी अब हमेशा पहले PC पर save होता है। Shared local table/branch reads internet response का इंतजार नहीं करते; refresh background में होता है।
- Network request 30 सेकंड में timeout होगी। Failed sync PC की entry नहीं मिटाता; retry अंतराल 30 सेकंड से बढ़कर अधिकतम 5 मिनट है। आठ failures के बाद भी auto-retry बंद नहीं होता।
- Background sync का छोटा status दिखता है; सामान्य network failure पर popup नहीं है। Permission/data conflict को दबाकर सफल नहीं दिखाया जाता; entry review के लिए सुरक्षित pending रहती है।
- Closed cash day में नई/बदली/deleted खर्च entry SQL और local mutation guard रोकते हैं। Day closing/entry transactions एक database lock साझा करते हैं।
- दो PCs की identical closing entry_date से एक server row में जाती है। अलग amounts वाली conflicting closing reject होती है; automatic overwrite नहीं होता।
- एक ही baseline का Cash→UPI correction दो PCs से आने पर receipt IDs समान हैं। अलग-अलग target modes के conflicting corrections server रोकता है।
- Staff का admin-reopened day refresh Electron main process के verified cloud request से होता है; renderer अपनी तरफ से fake reopened row नहीं दे सकता।
- Branch-limited staff अपने branch के cached patient number पर offline SMS queue कर सकता है। अनजान/दूसरे branch का number denied है।
- Billing message/export/reminder में discount घटता है; desktop message का report link public website का है।

### इस update को लागू करने का क्रम
1. Database backup लें और पहले दोनों migrations `20261005150000_fix_report_02_20.sql` तथा `20261006120000_fix_deep_audit_f01_f16.sql` लागू रखें।
2. नई `supabase/migrations/20261006180000_offline_cashbook_followup.sql` Supabase SQL Editor में लागू करें। GitHub push इसे deploy नहीं करता।
3. नया EXE सभी PCs पर लगाएँ; दो-PC correction में दोनों clients नया version इस्तेमाल करें। पुराने pending corrections अपने पुराने IDs रखते हैं और जरूरत पर review करें।
4. Local काम के लिए verified login session जरूरी है; इस patch में login policy नहीं बदली। नया login/expired session की verification के लिए internet चाहिए।
5. SMS delivery, PDF sharing/upload और AI की online services इंटरनेट लौटने पर ही उपलब्ध होती हैं। SQLite file में saved records और sync queue रहते हैं; software पूरा बंद हो तो background worker नहीं चलता, अगली बार app खुलने पर शुरू होता है।

### जाँच
- `node tests/offline-first.cjs`: असली अस्थायी SQLite file बंद/खोलकर row, queue और retry deadline; stalled network पर local reads; 8 से अधिक failures के बाद retry; Ortho local edit; request timeout।
- `node tests/offline-cashbook.cjs`: test-only `@electric-sql/pglite` चाहिए (या `PGLITE_MODULE_PATH`); N01–N07 और conflicting corrections के tests। Live clinic data इस्तेमाल नहीं किया गया।
- पुराने regression/login tests, TypeScript और production React build पास हैं। Windows/live Supabase deployment की पुष्टि अलग से करनी होगी।
- `PATCH-FILES.sha256` में workflow द्वारा बदलने वाली package version files शामिल नहीं हैं।
