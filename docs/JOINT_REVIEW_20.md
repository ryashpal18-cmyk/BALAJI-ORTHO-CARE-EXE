# Joint EXE / APK repair — 20 findings

Scope: the approved combined review list. PIN attempt lockout (old item 51) remains excluded.

| # | Repair | Verification |
|---|---|---|
| 1 | Physio plan markers and completed sessions use separate identities; packages with the same name use their bill identity. | IndexedDB + isolated PostgreSQL duplicate/race checks |
| 2 | Patient Advance deposits/refunds appear in dashboard, Billing tally, analytics, revenue and monthly collection reports. Cash book excludes this duplicate receipt projection because it already has Advance cash entries. | Finance and monthly accounting regressions |
| 3 | Account Credit is excluded from payment-mode reclassification and fresh income. | Mixed ledger/correction regressions |
| 4 | Full billing revision CAS, explicit conflicts, replay acknowledgement and atomic protection of later queued work. Legacy queued updates without a revision remain pending for review. | Synthetic real sync transport tests |
| 5 | workflow_data JSON survives sync while embedded patient relations are removed. | Transport payload checks |
| 6 | Unsent bill SMS rechecks current mobile, cancellation and SMS consent; accepted-send journal and weekly reminder protections retained. | No-gateway stale-message checks and existing weekly suites |
| 7 | Shared-mobile booking requires an explicit patient or new family member selection. | Booking identity regressions |
| 8 | Local patient deletion cannot cascade through financial history; paid/receipt bills require refund/cancellation. | Atomic rollback/delete regressions |
| 9 | Ordinary collections, receipt corrections and finance actions respect closed cash days. | Collection/closed-day regressions |
| 10 | Saved report JSON and nested field schema checked before viewing or printing. | Invalid JSON/nested object tests |
| 11 | Calendar dates must round-trip exactly (February 31 rejected). | Date regressions |
| 12 | Removal date stored in workflow; historical unknown removal dates stay explicit on reprints. | Source and metadata checks |
| 13 | Reconciliation compares receipt dates, modes, histories and patient/bill workflow including Advance. | Financial field difference tests |
| 14 | EXE closing/reopening New Bill preserves its persisted draft; restore/discard remain explicit; editing another bill does not clear it. | Actual AST-extracted dialog/effect regression |
| 15 | APK atomic combined collection, Cash+UPI, Advance deposit/apply/refund and detailed statement with running Advance balances. | IndexedDB transaction, idempotency, stale preview and portable statement tests |
| 16 | Immutable demographic snapshot and stored invoice label on new bills; existing cloud labels respected in display/print. | Creation/sync/portable invoice tests |
| 17 | Reviewed cloud rate-list download/apply and upload beside local catalog editing. | Typecheck/build and catalog validation |
| 18 | Full backup finance/queue/reference validation, disposable IndexedDB restore rehearsal and attachment checksums; live restore rechecks empty destination atomically. | Synthetic isolated restore tests |
| 19 | Follow-up attendance is scoped to visit date, retains dated history and is not reset by a removal-only change. | Date/workflow regressions |
| 20 | EXE SQL receipt-trigger fixture closes the runtime business date rather than assuming the release date. | SQL suite passes on 2026-11-02 |

Cloud: applied additive `clinic_apk_physio_package_identity` and `clinic_physio_package_prefix_validation` migrations. No historical DML or real messages. Snapshot before/after first migration: patients 1,158; bills 1,316; amount paid ₹903,584. Existing security advisory baseline retained; helper is SECURITY INVOKER and anon cannot execute it.

Validation: APK typecheck, all 15 Node suites and Vite production build; EXE 40 Node suites, typecheck and production build. Release CI additionally builds Android APK and runs the existing Windows native UI/PDF checks before EXE publication.

Limits: no access to a physical clinic printer, Windows PC or Android device in this environment. Actual device installation, printing and message delivery are not claimed as tested. Android WhatsApp PDF flow opens the system share sheet and requires choosing the correct chat and Send.
