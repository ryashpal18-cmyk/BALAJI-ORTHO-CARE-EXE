/**
 * PlasterSync — Ek baar chalao, kaam ho jaaye
 * Purane bills scan karo → plaster wale patients → OrthoPanel mein add karo
 * Route: /#/plaster-sync
 */

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PLASTER_KEYWORDS = ["plaster", "p.o.p", "pop", "cast", "slab", "splint", "पलस्तर"];

function hasPlaster(service: string): boolean {
  if (!service) return false;
  const lower = service.toLowerCase();
  return PLASTER_KEYWORDS.some((kw) => lower.includes(kw));
}

function getPlasterService(service: string): string {
  if (!service) return "Plaster";
  const parts = service.split("|").filter(Boolean);
  const found = parts.find((s) =>
    PLASTER_KEYWORDS.some((kw) => s.toLowerCase().includes(kw))
  );
  return found ? found.split(":")[0].trim() : "Plaster";
}

export default function PlasterSync() {
  const [log, setLog]       = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone]     = useState(false);
  const [stats, setStats]   = useState({ scanned: 0, added: 0, skipped: 0, errors: 0 });

  const addLog = (msg: string) => setLog((prev) => [...prev, msg]);

  const runSync = async () => {
    setRunning(true);
    setLog([]);
    setDone(false);
    setStats({ scanned: 0, added: 0, skipped: 0, errors: 0 });

    let scanned = 0, added = 0, skipped = 0, errors = 0;

    try {
      // 1. Saare bills fetch karo
      addLog("📋 Saare bills fetch ho rahe hain...");
      const { data: bills, error: billErr } = await supabase
        .from("billing" as any)
        .select("id, patient_id, service, created_at, patients(id, name, mobile)")
        .order("created_at", { ascending: false });

      if (billErr) throw new Error("Bills fetch fail: " + billErr.message);
      addLog(`✅ ${bills?.length || 0} bills mile`);

      // 2. Plaster wale bills filter karo
      const plasterBills = (bills || []).filter((b: any) => hasPlaster(b.service || ""));
      addLog(`🔍 ${plasterBills.length} bills mein plaster service mili`);

      // 3. Existing fracture cases fetch karo (duplicate avoid ke liye)
      const { data: existingCases } = await supabase
        .from("fracture_cases" as any)
        .select("patient_id, plaster_status");
      const activePatients = new Set(
        (existingCases || [])
          .filter((c: any) => c.plaster_status === "Active")
          .map((c: any) => c.patient_id)
      );
      addLog(`📊 ${activePatients.size} patients already OrthoPanel mein active hain`);
      addLog("─────────────────────────────────");

      // 4. Har plaster bill ke liye case add karo
      const processedPatients = new Set<string>(); // ek patient ek baar hi

      for (const bill of plasterBills) {
        scanned++;
        const patient = (bill as any).patients;
        const patientId = bill.patient_id;
        const patientName = patient?.name || patientId;

        // Already active case hai?
        if (activePatients.has(patientId)) {
          addLog(`⏭️  Skip: ${patientName} — already active case hai`);
          skipped++;
          continue;
        }

        // Is run mein already process kiya?
        if (processedPatients.has(patientId)) {
          skipped++;
          continue;
        }

        processedPatients.add(patientId);

        const plasterSvc = getPlasterService(bill.service || "");
        const billDate = (bill.created_at || "").split("T")[0] || new Date().toISOString().split("T")[0];
        const nextFollowup = new Date(new Date(billDate).getTime() + 7 * 24 * 60 * 60 * 1000)
          .toISOString().split("T")[0];

        try {
          const { error: insertErr } = await supabase
            .from("fracture_cases" as any)
            .insert({
              patient_id: patientId,
              patient_type: "fracture",
              body_part: "Unknown",
              side: null,
              fracture_type: "Unknown",
              plaster_type: plasterSvc,
              plaster_date: billDate,
              followup_days: 7,
              next_followup_date: nextFollowup,
              plaster_status: "Active",
              doctor_notes: `Auto-migrated from billing (Bill ID: ${bill.id})`,
            });

          if (insertErr) throw insertErr;
          added++;
          addLog(`✅ Added: ${patientName} — ${plasterSvc} (${billDate})`);
        } catch (e: any) {
          errors++;
          addLog(`❌ Error: ${patientName} — ${e.message}`);
        }
      }

      addLog("─────────────────────────────────");
      addLog(`🎉 Sync complete!`);
      addLog(`   Scanned : ${scanned}`);
      addLog(`   Added   : ${added}`);
      addLog(`   Skipped : ${skipped}`);
      addLog(`   Errors  : ${errors}`);
      setStats({ scanned, added, skipped, errors });
      setDone(true);

    } catch (e: any) {
      addLog(`💥 Fatal error: ${e.message}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "24px 16px" }}>
        <Card>
          <CardHeader>
            <CardTitle style={{ fontSize: 18 }}>
              🦴 Plaster Sync — Purane Bills → OrthoPanel
            </CardTitle>
            <p style={{ fontSize: 13, color: "#5a6a84", marginTop: 6 }}>
              Ye tool purane saare bills scan karega. Jis patient ke bill mein
              <strong> Plaster / POP / Cast / Slab / Splint</strong> tha aur wo
              OrthoPanel mein nahi hai — usko automatically add kar dega.
              <br />
              <strong>Ye ek baar chalao — bas.</strong>
            </p>
          </CardHeader>
          <CardContent style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Stats */}
            {done && (
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8,
              }}>
                {[
                  { label: "Scanned", value: stats.scanned, color: "#3b82f6" },
                  { label: "Added", value: stats.added, color: "#16a34a" },
                  { label: "Skipped", value: stats.skipped, color: "#d97706" },
                  { label: "Errors", value: stats.errors, color: "#dc2626" },
                ].map((s) => (
                  <div key={s.label} style={{
                    padding: "10px 8px", borderRadius: 10, textAlign: "center",
                    background: "#f8fafc", border: `2px solid ${s.color}22`,
                  }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: "#5a6a84" }}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Button */}
            <Button
              onClick={runSync}
              disabled={running}
              style={{
                background: done ? "#16a34a" : "#1e57b0",
                width: "fit-content",
                gap: 8,
              }}
            >
              {running ? "⏳ Sync chal raha hai..." : done ? "✅ Dobara Run Karo" : "▶️ Sync Shuru Karo"}
            </Button>

            {/* Log */}
            {log.length > 0 && (
              <div style={{
                background: "#0f172a", borderRadius: 10, padding: 14,
                maxHeight: 380, overflowY: "auto",
                fontFamily: "monospace", fontSize: 12, color: "#94a3b8",
                display: "flex", flexDirection: "column", gap: 3,
              }}>
                {log.map((line, i) => (
                  <div key={i} style={{
                    color: line.startsWith("✅") ? "#4ade80"
                      : line.startsWith("❌") ? "#f87171"
                      : line.startsWith("⏭️") ? "#fbbf24"
                      : line.startsWith("🎉") ? "#818cf8"
                      : "#94a3b8",
                  }}>
                    {line}
                  </div>
                ))}
              </div>
            )}

          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
