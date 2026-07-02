<!-- Sync check: latest Lovable project changes ready for GitHub sync. -->
Balaji Ortho Care — Features
🏥 Patient Management
Naya patient registration (OPD entry se)
Patient list — search by name/mobile (turant, offline bhi)
Patient Profile — poora history ek jagah (visits, bills, prescriptions, X-rays)
Patient history timeline
💰 Billing & Payments
OPD billing — invoice generate + print (A5 landscape format)
Bill create/update/delete, due amount tracking
Cash tally / daily collection report
Revenue dashboard
Medicine commission tracking
🦴 Ortho / Fracture Management
Fracture case management — recovery timeline, visit-wise notes
Plaster/cast tracking with auto-billing detection
Plaster removal certificate generation
Body map (visual injury marking)
Recovery tracker + follow-up scheduling
Plaster sync
📸 X-Ray Module
Orthanc DICOM server integration (Konica CR machine se direct)
X-Ray viewer — zoom, pan, rotate, brightness/contrast, invert, compare mode
X-Ray PDF report generation (offline bhi)
WhatsApp/print se X-ray share
💊 Medicine & Inventory
Medicine master list
Stock in/out tracking with movement history
Low-stock alerts
Patient medicine dispensing (billing se linked)
📅 Appointments & Scheduling
Appointment booking (staff se)
Patient self-service online booking
Booking requests management (admin approval)
Reminders
🩺 Physiotherapy & IPD
Physiotherapy session tracking
IPD (in-patient) module
Bed management
🏢 Multi-Branch & Insurance
Multi-branch support
Insurance/TPA claims module
📊 Reports & Analytics
Analytics dashboard (patients, revenue trends)
Custom reports
Audit log — kis staff ne kya action kiya
📱 Communication
WhatsApp integration (persistent session, QR ek baar hi scan)
SMS (TextBee API) — bill, appointment, fracture-care reminders
SMS logs
⚙️ Settings & Admin
Clinic settings, doctor/staff profiles
Login/auth system, role-based access
Backup management (manual + automatic)
Diagnostic tool — app health, error logs, IPC check, live record counts
🔌 Offline-First Architecture
Sab kuch offline chalta hai — patients, billing, appointments, prescriptions, physiotherapy, X-ray, inventory, audit log, analytics, reports
Naya data turant local disk (IndexedDB) pe save hota hai — instant, kabhi wait nahi
Internet aane par background mein automatically Supabase cloud pe sync
Sirf 2 cheezein internet maangti hain: (1) SMS bhejna, (2) cloud sync
Purana data bhi local mein download hokar rehta hai — patient search internet ke bina bhi turant
Real-time disk backup (har 3 minute + app band karte waqt) — IndexedDB fail ho bhi jaaye to data safe
🖥️ Platform
Desktop app (Windows) — Electron based, auto-update GitHub Releases se
Mobile app (Android APK) — Capacitor based, offline-first sync ke saath
