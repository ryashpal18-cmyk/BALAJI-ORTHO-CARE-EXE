# IPD and compact desktop UI fixes — 2026-10-08

- New Admission opens a registered-patient / available-bed form.
- Bed cards are keyboard-accessible buttons that open assignment/status details.
- Occupied, reserved and available states save through the existing durable offline mutation queue. Release clears only the bed assignment; it does not delete patient or billing records.
- Prevent duplicate local patient allocation, detect a changed bed while the form was open, and keep the form open on write failure.
- Refresh bed names from local patients and invalidate dashboard occupancy after save.
- Header search can shrink; actions wrap and the admission label becomes an accessible icon on narrower windows.

## Verification

- TypeScript, production build and existing 29-check audit regression suite.
- `tests/ui-ipd.cjs`: browser test using an isolated test login and fake Electron storage bridge; no live patient data or cloud requests. Covers admit, reload, duplicate prevention, simulated disk failure, release preservation, reserve/admit, and 1366/1024/800px horizontal bounds.
- To reproduce: build the app, start Vite preview at `http://127.0.0.1:4173`, then run `node tests/ui-ipd.cjs` with Playwright available. `PLAYWRIGHT_MODULE_PATH`, `CHROMIUM_EXECUTABLE_PATH` and optional JSON `CHROMIUM_ARGS` support an external test runtime. This browser check is separate from the Windows packaging workflow.

## Scope

Uses the existing beds table: no SQL migration or patient-data cleanup. Beds remain a shared clinic-wide list as in the existing schema. Duplicate/conflict checks are local; simultaneous offline edits on different devices still require sync conflict handling. Actual Windows installer, native IPC and printer interaction are not simulated by this UI test.
