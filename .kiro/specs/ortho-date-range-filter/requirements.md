# Requirements: Ortho Panel Date-Range Patient Filter

## Introduction

The clinic owner wants to see how many Ortho patients came in the last 15 days, 1 month or 1.5 months. When the owner is on leave, they want to SMS and call all those patients together. The feature lives in the Ortho Panel on the Dashboard (`src/components/ortho/OrthoPanel.tsx`).

(These requirements were written from the chat request. No prior requirements file existed.)

## Requirements

### Requirement 1: Date-range filter with patient count

**User Story:** As the clinic owner, I want to filter Ortho patients by how recently they came, so that I can see how many patients fall in a period.

#### Acceptance Criteria
1. The Ortho Panel SHALL show preset ranges: last 7 days, 15 days, 1 month (30 days), 1.5 months (45 days) and 2 months (60 days).
2. The Ortho Panel SHALL offer a custom range with From and To dates.
3. WHEN a range is chosen, the system SHALL show the number of unique patients in that range.
4. The system SHALL use `plaster_date` as the patient's date, and `created_at` WHEN `plaster_date` is empty.
5. The range SHALL include both its start and end dates.
6. The user SHALL be able to limit the result to Active plaster cases or include all cases.
7. IF one patient has several cases in the range, THEN the system SHALL count and list that patient once.

### Requirement 2: Patient list

**User Story:** As the clinic owner, I want to see who is in the filtered range, so that I can check the list before contacting anyone.

#### Acceptance Criteria
1. The system SHALL list each patient with name, mobile, side and body part, and date.
2. The system SHALL show a checkbox per patient, selected by default, plus Select All / Deselect All.
3. WHEN the range or case filter changes, the system SHALL reset the selection to all patients with a mobile number.
4. IF a patient has no mobile number, THEN the system SHALL show "No mobile", disable the checkbox and exclude the patient from SMS and call actions.
5. IF any patients lack a mobile number, THEN the system SHALL show a warning with their count.

### Requirement 3: Bulk SMS

**User Story:** As the clinic owner, I want to send one SMS to all selected patients, so that I can inform them while I am on leave.

#### Acceptance Criteria
1. WHEN the user clicks the SMS button, the system SHALL open the existing Custom SMS dialog with the selected patients pre-selected.
2. The SMS button SHALL show the selected count and SHALL be disabled WHEN none are selected.
3. The system SHALL send SMS through the existing `sendSMS` service, so offline queuing keeps working.

### Requirement 4: Call list

**User Story:** As the clinic owner, I want a call list of the filtered patients, so that I can phone them one after another.

#### Acceptance Criteria
1. The system SHALL show a Call link (`tel:`) for each patient who has a mobile number.
2. WHEN the user clicks Copy Call List, the system SHALL copy "name - mobile" lines for the selected patients to the clipboard and show a confirmation.
3. The system SHALL NOT claim to place several calls at once, because a desktop app cannot do that.

### Non-functional

1. The feature SHALL read only from the cached `fracture_cases` data already loaded by `useFractureCases`, so it works offline.
2. The feature SHALL NOT change the database schema or the existing hooks.
3. The feature SHALL follow the existing UI components and the Hinglish wording used in the panel.

### Requirement 5: Plaster active for 48 days only

**User Story:** As the clinic owner, I want a plaster case to count as active only for 48 days, so that old cases stop showing as active.

#### Acceptance Criteria
1. A case SHALL count as active only IF `plaster_status` is "Active" AND no more than 48 days have passed since `plaster_date` (or `created_at` when `plaster_date` is empty), in IST.
2. From day 49, the case SHALL show as "Inactive" in the Completed / Inactive section, everywhere active counts, follow-up alerts, missed follow-ups, the Follow-ups page and bulk messages are computed.
3. IF a case has no date, THEN the system SHALL use `plaster_status` alone.
4. The rule SHALL NOT rewrite `plaster_status` in the database. It is applied when data is read.
5. Billing SHALL NOT change. Its auto-add of fracture cases keeps its existing behavior.

### Requirement 6: WhatsApp + SMS to active plaster patients

**User Story:** As the clinic owner, I want to send one custom message (for example a leave notice) to all active plaster patients by WhatsApp and SMS together, so that they are informed automatically.

#### Acceptance Criteria
1. The Ortho Panel SHALL show a card with the count of unique active plaster patients and a button to compose a message.
2. The user SHALL be able to choose WhatsApp, SMS or both, with both selected by default.
3. The system SHALL offer ready templates (leave notice, clinic reopened, blank) and allow any custom text, with `[NAME]` replaced by the patient name.
4. The system SHALL show a preview (unique numbers, duplicates, invalid, blocked) before anything is sent, and ask for confirmation.
5. After confirmation, the system SHALL queue the messages in the existing outreach service, which sends WhatsApp and SMS automatically and shows per-number status.
6. The card SHALL only work in the Windows EXE. Elsewhere it SHALL say so.
