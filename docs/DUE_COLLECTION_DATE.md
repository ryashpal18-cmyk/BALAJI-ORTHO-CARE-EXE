# बकाया भुगतान: जमा होने की तारीख पर प्राप्ति

पुराने बिल पर आज जमा की गई रकम आज की प्राप्ति में दिखती है। बिल की
`created_at` तारीख और उसकी मूल राशि/छूट नहीं बदली जातीं। रसीद के `paid_at`
की भारतीय तारीख (Asia/Kolkata) से प्राप्ति जोड़ी जाती है।

उदाहरण: 1 अक्टूबर के ₹1,000 बिल पर उसी दिन ₹100 जमा और 24 अक्टूबर को
₹500 जमा हुआ। 1 अक्टूबर की प्राप्ति ₹100 और 24 अक्टूबर की प्राप्ति ₹500
है। 24 अक्टूबर के नए बिल पर ₹250 और जमा हो तो उस दिन कुल प्राप्ति ₹750 है।

## इस बदलाव का दायरा

- Billing में चयनित अवधि का Received सभी bills की उसी अवधि की receipts से है।
- Cash Tally में नए bills की जमा रकम और पुराने बकाये की प्राप्ति का एक ही जोड़
  दिखता है। Collections table और print में payment date, original bill date,
  patient, payment mode और उस receipt की राशि दिखती है। Bills table अपनी
  original date पर रहती है; उसका Paid अब तक की cumulative रकम है। दोनों
  tables के footer अपने-अपने rows के बराबर हैं।
- Revenue Dashboard के आज/महीने/daily-collection chart में receipt date से
  प्राप्ति आती है। Invoice-based top services और current outstanding का हिसाब
  वही है। Payment modes receipts से लिए जाते हैं ताकि Cash/UPI का पुराना
  भुगतान बाद की recovery के mode में न चला जाए।
- Analytics में payment_history पढ़ी जाती है, मासिक प्राप्ति receipt month से
  आती है और pending local receipt को cloud sync का इंतजार नहीं करना पड़ता।
  बिल save/edit/delete होने पर Analytics cache invalidate होती है।
- Dashboard और Daily Cash Book पहले से receipt dates का इस्तेमाल करते थे।
  उनकी write/sync logic नहीं बदली गई।

कोई migration, patient-data rewrite, bill-date rewrite या schema change नहीं है।
Payment saving, receipt identities, offline storage, audit, background sync,
SMS और WhatsApp sending के code paths नहीं बदले गए। नया shared helper
सिर्फ reporting पढ़ता है। Legacy records जिनमें receipt history नहीं है,
उनका मौजूदा fallback (bill date) बरकरार है; असली जमा तारीख बिना प्रमाण के
आज या किसी अन्य तारीख पर नहीं लगाई जाती।

## Validation

`tests/due-collection-date.cjs`: 11 synthetic checks covering partial/full recovery,
no-new-bill day, original invoice date, India midnight, negative correction,
legacy records, real screen expressions, Analytics pending-local/cloud overlay,
and printed report totals/escaping.

`tests/due-collection-electron.cjs`: 5 native Cash Tally checks covering the combined
received total, payment/original dates, unchanged invoice grouping, print and
original-day received total. CI runs this on Windows before packaging the EXE.
Existing clinic/offline/receipt, monthly-report and SMS/WhatsApp regression checks
remain in the workflow. No live payment or patient record is edited during tests.
