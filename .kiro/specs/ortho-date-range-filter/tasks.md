# Implementation Plan: Ortho Panel Date-Range Patient Filter

- [x] 1. Add `preselectAll` option to `CustomSmsDialog`
  - Add optional prop and a `useEffect` that selects all passed patients when the dialog opens.
  - _Requirements: 3.1_

- [x] 2. Build the `RangeFilterCard` component
  - [x] 2.1 Add `RANGE_PRESETS`, `daysAgoStr` and the range state (preset, custom From/To, status)
    - _Requirements: 1.1, 1.2, 1.6_
  - [x] 2.2 Derive `filtered`, `uniquePatients` and `withMobile` with `useMemo`
    - Use `plaster_date` with `created_at` fallback, inclusive bounds, one entry per patient.
    - _Requirements: 1.3, 1.4, 1.5, 1.7_
  - [x] 2.3 Show the unique patient count and the list with checkboxes, Select All and "No mobile" handling
    - Reset selection when the filter changes. Show the no-mobile warning.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 3. Add bulk SMS and call actions
  - [x] 3.1 SMS button showing the selected count, opening `CustomSmsDialog` with `preselectAll`
    - _Requirements: 3.1, 3.2, 3.3_
  - [x] 3.2 Per-patient `tel:` Call link and Copy Call List button with toast
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 4. Render `RangeFilterCard` in `OrthoPanel` above Active Plaster Patients
  - _Requirements: 1.1, Non-functional 1, 2, 3_

- [ ] 5. Install dependencies and type-check
  - Run `npm install`, then `npx tsc --noEmit -p .` and fix any errors in `OrthoPanel.tsx`.
  - _Requirements: Non-functional 3_

- [ ] 6. Manual verification in the running app
  - Seed or use real cases and check: counts for 15 / 30 / 45 days and custom range, boundary dates, duplicate patient counted once, no-mobile patient excluded, selection reset on filter change.
  - Check SMS dialog pre-selection, offline SMS queuing, and Copy Call List output.
  - _Requirements: 1.3-1.7, 2.3-2.5, 3.1-3.3, 4.1-4.2_

- [ ] 7. (Optional) Extract filter logic and add a unit test
  - Move the range/status/dedupe logic into `src/lib/orthoRangeFilter.ts` and cover boundaries, fallback date and duplicates.
  - _Requirements: 1.4, 1.5, 1.7_

- [ ] 8. Commit and open a pull request
  - Include `OrthoPanel.tsx` and this spec folder. Follow the branch policy for the session.

- [x] 9. Add `src/lib/plasterActive.ts` with `isPlasterActive` / `isPlasterExpired` (48-day rule, IST dates)
  - _Requirements: 5.1, 5.3, 5.4_

- [x] 10. Use the 48-day rule in OrthoPanel, Ortho page (stats, lists, report, long-leave SMS), Follow-ups page and Dashboard notifications
  - Billing and PlasterSync are left unchanged.
  - _Requirements: 5.2, 5.5_

- [x] 11. Add the "Active Plaster Patients ko WhatsApp + SMS" card using `VillageMessagePanel` and the outreach queue
  - `VillageMessagePanel` gets optional `buttonLabel`, `defaultSms`, `defaultMessage` and `templates` props. Existing callers are unchanged.
  - _Requirements: 6.1-6.6_

- [ ] 12. Manual check in the EXE: an active case 49 days old moves to Inactive; preview and send to a test number by WhatsApp and SMS.
