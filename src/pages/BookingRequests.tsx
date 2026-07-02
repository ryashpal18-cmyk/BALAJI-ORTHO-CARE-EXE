import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CalendarCheck, Check, X, Phone, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/hooks/useAuditLog";
import { offlineFetch, offlineUpdate, offlineInsert } from "@/lib/offlineQuery";
import { isOnline } from "@/lib/offlineSync";

interface BookingRequest {
  id: string;
  patient_name: string;
  mobile: string;
  preferred_date: string;
  preferred_time: string | null;
  reason: string | null;
  status: "Pending" | "Confirmed" | "Rejected";
  created_at: string;
}

export default function BookingRequests() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["booking-requests"],
    staleTime: 0,
    refetchOnMount: true,
    queryFn: async (): Promise<BookingRequest[]> => {
      return offlineFetch<BookingRequest>("booking_requests", async () => {
        const { data, error } = await supabase
          .from("booking_requests" as any)
          .select("*")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return (data || []) as any;
      });
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "Confirmed" | "Rejected" }) => {
      await offlineUpdate("booking_requests", id, { status });
      await logAudit({ action: "update", module: "booking-requests", recordId: id, description: `Status: ${status}` });
    },
    onSuccess: async (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["booking-requests"] });
      const online = await isOnline();
      toast({ title: online
        ? (vars.status === "Confirmed" ? "Confirm kar diya ✓" : "Reject kar diya")
        : "📥 Offline save ho gaya — net aane par sync hoga" });
    },
  });

  // Confirm karne par seedha appointments table me bhi daal do (patient pehle se ho to use karo, nahi to naya banao)
  const confirmAndCreateAppointment = async (req: BookingRequest) => {
    try {
      let patientId: string | null = null;
      const online = await isOnline();
      if (online) {
        try {
          const { data: existingPatients } = await supabase
            .from("patients").select("id").eq("mobile", req.mobile).limit(1);
          if (existingPatients?.length) {
            patientId = existingPatients[0].id;
          }
        } catch { /* offline ya network error — neeche naya patient offline banega */ }
      }
      if (!patientId) {
        const newPatient = await offlineInsert("patients", { name: req.patient_name, mobile: req.mobile });
        patientId = newPatient.id;
      }
      await offlineInsert("appointments", {
        patient_id: patientId,
        date: req.preferred_date,
        time_slot: req.preferred_time,
        notes: req.reason,
        status: "Scheduled",
      });
      await updateStatus.mutateAsync({ id: req.id, status: "Confirmed" });
    } catch {
      toast({ title: "Appointment banane me dikkat aayi", variant: "destructive" });
    }
  };

  const copyBookingLink = () => {
    const link = `${window.location.origin}${window.location.pathname}#/book-appointment`;
    navigator.clipboard.writeText(link);
    toast({ title: "Booking link copy ho gaya — patients ko WhatsApp/SMS kar sakte ho" });
  };

  const pending = requests.filter((r) => r.status === "Pending");

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="module-header flex items-center gap-2">
              <CalendarCheck className="h-6 w-6" /> Booking Requests
            </h1>
            <p className="text-sm text-muted-foreground">Patient self-booking se aayi requests yahan review karo</p>
          </div>
          <Button variant="outline" className="gap-1.5" onClick={copyBookingLink}>
            <Copy className="h-4 w-4" /> Booking Link Copy Karo
          </Button>
        </div>

        {pending.length > 0 && (
          <Badge variant="destructive" className="px-3 py-1.5">{pending.length} pending request(s)</Badge>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Saari Requests ({requests.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-left p-3 font-medium">Patient</th>
                    <th className="text-left p-3 font-medium">Mobile</th>
                    <th className="text-left p-3 font-medium">Date / Time</th>
                    <th className="text-left p-3 font-medium">Reason</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-right p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Loading...</td></tr>}
                  {!isLoading && requests.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Koi booking request nahi hai</td></tr>}
                  {requests.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="p-3 font-medium">{r.patient_name}</td>
                      <td className="p-3"><a href={`tel:${r.mobile}`} className="flex items-center gap-1 text-primary"><Phone className="h-3 w-3" />{r.mobile}</a></td>
                      <td className="p-3">{new Date(r.preferred_date).toLocaleDateString("en-IN")} {r.preferred_time || ""}</td>
                      <td className="p-3 text-muted-foreground">{r.reason || "—"}</td>
                      <td className="p-3">
                        <Badge variant="secondary" className={
                          r.status === "Confirmed" ? "bg-success/15 text-success" :
                          r.status === "Rejected" ? "bg-destructive/15 text-destructive" :
                          "bg-warning/15 text-warning"
                        }>{r.status}</Badge>
                      </td>
                      <td className="p-3">
                        {r.status === "Pending" && (
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" className="h-8 px-2 gap-1" onClick={() => confirmAndCreateAppointment(r)}>
                              <Check className="h-3.5 w-3.5" /> Confirm
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => updateStatus.mutate({ id: r.id, status: "Rejected" })}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
