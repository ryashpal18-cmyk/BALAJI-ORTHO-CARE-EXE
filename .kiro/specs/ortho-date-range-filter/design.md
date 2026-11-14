# Design: Ortho Panel Date-Range Patient Filter

## Overview

A new `RangeFilterCard` component in `src/components/ortho/OrthoPanel.tsx` filters fracture cases by date range, shows the unique patient count, and offers bulk SMS and a call list. It is rendered in `OrthoPanel` between the Follow-up Alerts card and the Active Plaster Patients card. No new files, hooks, routes or schema changes.

## Architecture

```
Dashboard
└── OrthoPanel
    ├── useFractureCases()  ──► cases (already includes patient via attachPatientsToCases)
    └── RangeFilterCard cases={cases}
        ├── range controls (presets / custom dates / status)
        ├── derived data (useMemo): filtered → uniquePatients → withMobile
        ├── patient list (checkbox + tel: link)
        ├── Copy Call List  → navigator.clipboard
        └── CustomSmsDialog (existing, now with preselectAll) → sendSMS()
```

Data comes from `useFractureCases`, which reads from the offline cache (`offlineFetch`). The card makes no network calls of its own.

## Components and interfaces

### RangeFilterCard (new)
Props: `{ cases: any[] }`.

State:
| State | Type | Default | Purpose |
|---|---|---|---|
| `days` | `number \| "custom"` | `15` | Selected preset or custom |
| `from`, `to` | `string` (YYYY-MM-DD) | 15 days ago, today | Custom range |
| `status` | `"Active" \| "All"` | `"All"` | Case filter |
| `picked` | `Set<string>` | all with mobile | Selected case ids |
| `smsOpen` | `boolean` | `false` | SMS dialog |
| `showList` | `boolean` | `true` | List visibility |

Derived (all `useMemo`):
1. `range`: `{start, end}`. Presets use `daysAgoStr(days)` to `todayStr()`. Custom uses `from`/`to`.
2. `filtered`: cases where status matches and `(plaster_date || created_at).slice(0,10)` is in `[start, end]` (string comparison on ISO dates, inclusive). Sorted newest first.
3. `uniquePatients`: one case per `patient_id` (first, which is the newest because of the sort).
4. `withMobile`: unique patients with `patients.mobile` and `patients.name`.

A `useEffect` on `withMobile` resets `picked` to all with-mobile ids, so a filter change resets the selection.

### CustomSmsDialog (modified)
Added optional prop `preselectAll`. A `useEffect` on `[open, preselectAll]` selects every patient passed in when the dialog opens. Existing callers do not pass it, so their behavior is unchanged.

### Helpers
- `daysAgoStr(n)`: `businessDate()` of today minus `n` days. It reuses `businessDate` so dates match the rest of the app's day boundary.
- `RANGE_PRESETS`: `[7, 15, 30, 45, 60]` with labels.

## Behavior decisions

| Decision | Choice | Reason |
|---|---|---|
| Date field | `plaster_date`, fallback `created_at` | Plaster date is the visit date for a fracture case. Older rows may lack it. |
| Duplicate patients | Keep newest case only | Avoids sending the same SMS twice. |
| Bulk call | `tel:` links and copyable list | A desktop app cannot dial many numbers at once. `DueAmount.tsx` already uses `tel:`. |
| Default status | All cases | The owner wants to reach everyone who came, including removed plasters. "Active only" is one click away. |
| Selection reset | On any filter change | Prevents sending to patients no longer shown. |
| Data source | Existing `useFractureCases` | Works offline and needs no schema change. |

## Error handling
- No mobile number: row shows "No mobile", checkbox disabled, patient excluded, warning shown.
- Clipboard failure: destructive toast "Copy nahi hua".
- SMS failures or offline queuing: handled by the existing dialog and `sendSMS` (Sent / Pending badges).
- Empty range: "Is range me koi patient nahi." and SMS/Copy buttons disabled.

## Testing strategy
The filtering logic is pure and lives inside the component. Verification:
1. Manual: seed cases with various `plaster_date` values and check counts for 15, 30, 45 days and custom ranges, including the boundary dates.
2. Manual: two cases for one patient count once. A patient without mobile is excluded.
3. Manual: SMS dialog opens with the selected patients pre-selected. Copy Call List output matches the selection.
4. Optional: extract `filterCasesByRange` into `src/lib` and add a unit test (the repo's tests are `.cjs` files under `tests/`, so a TS helper needs a loader like the one in `tests/offline-first.cjs`).

## Known limitations
- The "count" is of fracture cases' patients. Patients seen only in OPD (no fracture case) are not included.
- Date comparison uses the stored `YYYY-MM-DD` prefix. A `created_at` UTC timestamp near midnight could fall on the neighboring day.
