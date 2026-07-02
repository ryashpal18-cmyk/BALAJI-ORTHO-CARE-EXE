import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Pill, Receipt, Bone, CalendarClock, FilePlus2, History,
} from "lucide-react";
import { offlineFetchScoped } from "@/lib/offlineQuery";

type TimelineItem = {
  id: string;
  type: "prescription" | "bill" | "fracture" | "appointment";
  date: string;
  title: string;
  subtitle: string;
};

const ICONS: Record<TimelineItem["type"], any> = {
  prescription: FilePlus2,
  bill: Receipt,
  fracture: Bone,
  appointment: CalendarClock,
};

const COLORS: Record<TimelineItem["type"], string> = {
  prescription: "#0ea5e9",
  bill: "#16a34a",
  fracture: "#6366f1",
  appointment: "#f59e0b",
};

export function PatientHistoryTimeline({ patientId }: { patientId: string }) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!patientId) return;
    (async () => {
      setLoading(true);
      const [rx, bills, fx, appts] = await Promise.all([
        offlineFetchScoped<any>(
          "prescriptions",
          async () => {
            const { data, error } = await supabase.from("prescriptions").select("*").eq("patient_id", patientId);
            if (error) throw error;
            return data || [];
          },
          (cached) => cached.filter((r: any) => r.patient_id === patientId),
        ),
        offlineFetchScoped<any>(
          "billing",
          async () => {
            const { data, error } = await supabase.from("billing").select("*").eq("patient_id", patientId);
            if (error) throw error;
            return data || [];
          },
          (cached) => cached.filter((b: any) => b.patient_id === patientId),
        ),
        offlineFetchScoped<any>(
          "fracture_cases",
          async () => {
            const { data, error } = await supabase.from("fracture_cases" as any).select("*").eq("patient_id", patientId);
            if (error) throw error;
            return data || [];
          },
          (cached) => cached.filter((f: any) => f.patient_id === patientId),
        ),
        offlineFetchScoped<any>(
          "appointments",
          async () => {
            const { data, error } = await supabase.from("appointments").select("*").eq("patient_id", patientId);
            if (error) throw error;
            return data || [];
          },
          (cached) => cached.filter((a: any) => a.patient_id === patientId),
        ),
      ]);

      const merged: TimelineItem[] = [
        ...((rx as any[]) || []).map((r) => ({
          id: `rx-${r.id}`,
          type: "prescription" as const,
          date: r.created_at,
          title: "Prescription",
          subtitle: r.diagnosis || r.medicines || "Prescription issued",
        })),
        ...((bills as any[]) || []).map((b) => ({
          id: `bill-${b.id}`,
          type: "bill" as const,
          date: b.created_at,
          title: `Bill — ₹${Number(b.amount || 0).toLocaleString("en-IN")}`,
          subtitle: `${b.service || "Service"} · ${b.status}`,
        })),
        ...((fx as any[]) || []).map((f) => ({
          id: `fx-${f.id}`,
          type: "fracture" as const,
          date: f.created_at,
          title: `${f.side || ""} ${f.body_part || "Fracture"}`.trim(),
          subtitle: `${f.fracture_type || "-"} · ${f.plaster_status}`,
        })),
        ...((appts as any[]) || []).map((a) => ({
          id: `appt-${a.id}`,
          type: "appointment" as const,
          date: a.created_at || a.date,
          title: "Appointment",
          subtitle: `${a.date}${a.time_slot ? " · " + a.time_slot : ""} · ${a.status}`,
        })),
      ].sort((x, y) => (y.date || "").localeCompare(x.date || ""));

      setItems(merged);
      setLoading(false);
    })();
  }, [patientId]);

  return (
    <div className="border rounded-xl bg-card overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <span className="font-semibold">Complete History Timeline</span>
        <span className="ml-auto text-xs text-muted-foreground">{items.length} events</span>
      </div>

      {loading ? (
        <p className="p-6 text-center text-sm text-muted-foreground">Loading...</p>
      ) : items.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">Koi history nahi mili</p>
      ) : (
        <div className="p-4 space-y-0 max-h-[420px] overflow-auto">
          {items.map((item, idx) => {
            const Icon = ICONS[item.type];
            const color = COLORS[item.type];
            return (
              <div key={item.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className="h-7 w-7 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: `${color}1a` }}
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color }} />
                  </div>
                  {idx < items.length - 1 && <div className="w-px flex-1 bg-border my-1" />}
                </div>
                <div className="pb-4 min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {item.date ? new Date(item.date).toLocaleDateString("en-IN") : "-"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
