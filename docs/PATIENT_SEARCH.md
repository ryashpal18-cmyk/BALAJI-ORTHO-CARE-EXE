# Patient Search (Windows PC)

Sidebar → Patient Search, admin login required. Name or mobile search combines with village/address search or a saved-address selection. Reads local SQLite only, including unsynced patient changes. Refresh on open, every 5 seconds and with Refresh; selected branch applies before options/counts. Counts describe records available on this PC, not a guarantee that another device/cloud has synced.

Villages come from the existing OPD Village / Address field. Case, surrounding/repeated spaces and Hindi digits are normalized. A saved address is an exact filter; village text search matches within a full address. Different Hindi/English spellings are not guessed to refer to the same village. Missing addresses have their own option.

Patients remain separate when family members share a phone. Canonical/local aliases deduplicate by patient ID; unsynced changes take precedence. No records are edited or deleted. The list shows names, phone, address, age/gender and links to the existing patient profile. Fifty rows per page; counts and SMS number copy cover the entire filtered result, not just the displayed page.

SMS number copy produces unique valid Indian mobile numbers (10 digits), excluding missing/invalid/dummy numbers. A shared family mobile occurs once. Copying/filtering never queues or sends an SMS. Clipboard failure provides a selectable number box. A local read failure is visible and disables copy until a successful refresh.

Validation: synthetic SQLite alias/dedup/pending/read-only checks; name/phone/Hindi digit/village/combined/branch/invalid number tests; actual React UI in Windows Electron checks pagination, filter reset, all-results copy, profile navigation, empty results and read failures. Real clinic data completeness, spelling quality, recipient delivery and actual Windows clipboard remain device checks.

The filtered list now includes a direct WhatsApp/SMS campaign panel with full-list
preview, normalized-number deduplication and a durable queue. See
[FIVE_CLINIC_UPDATES.md](FIVE_CLINIC_UPDATES.md) for controls and validation.
