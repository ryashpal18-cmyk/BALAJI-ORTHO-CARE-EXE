import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CalendarCheck, CheckCircle2 } from "lucide-react";
import logo from "@/assets/logo.png";

/**
 * PUBLIC page — login ki zaroorat nahi (HashRouter route '/book-appointment').
 * Patient apna naam/mobile/date dalkar request bhejta hai, jo staff ko
 * "Booking Requests" page (admin-only) me dikhta hai approval ke liye.
 */
export default function BookAppointment() {
  const [form, setForm] = useState({ patient_name: "", mobile: "", preferred_date: "", preferred_time: "", reason: "" });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError("");
    if (!form.patient_name || !form.mobile || !form.preferred_date) {
      setError("Naam, mobile aur date zaroori hai");
      return;
    }
    if (!/^\d{10}$/.test(form.mobile.replace(/\D/g, ""))) {
      setError("Sahi 10-digit mobile number daalo");
      return;
    }
    setLoading(true);
    try {
      const { error: insertError } = await supabase.from("booking_requests" as any).insert({
        patient_name: form.patient_name,
        mobile: form.mobile,
        preferred_date: form.preferred_date,
        preferred_time: form.preferred_time || null,
        reason: form.reason || null,
      });
      if (insertError) throw insertError;
      setSubmitted(true);
    } catch {
      setError("Request bhejne me dikkat aayi, dobara try karo ya clinic ko call karo");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f1f5f9", padding: 16 }}>
        <Card className="max-w-sm w-full text-center">
          <CardContent className="pt-8 pb-8 space-y-3">
            <CheckCircle2 className="h-12 w-12 text-success mx-auto" />
            <h2 className="text-lg font-bold">Request Bhej Diya!</h2>
            <p className="text-sm text-muted-foreground">
              Aapki appointment request clinic ko mil gayi hai. Confirmation ke liye clinic se call/SMS aayega.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f1f5f9", padding: 16 }}>
      <Card className="max-w-sm w-full">
        <CardHeader className="text-center space-y-2">
          <img src={logo} alt="Balaji" style={{ height: 48, width: 48, margin: "0 auto", borderRadius: 12 }} />
          <CardTitle className="flex items-center justify-center gap-2">
            <CalendarCheck className="h-5 w-5" /> Appointment Book Karo
          </CardTitle>
          <p className="text-xs text-muted-foreground">Balaji Ortho Care Center — Dr. S. S. Rathore</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Patient ka Naam *</Label><Input value={form.patient_name} onChange={(e) => setForm({ ...form, patient_name: e.target.value })} /></div>
          <div><Label>Mobile Number *</Label><Input type="tel" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} placeholder="10 digit number" /></div>
          <div><Label>Pasandida Date *</Label><Input type="date" value={form.preferred_date} onChange={(e) => setForm({ ...form, preferred_date: e.target.value })} min={new Date().toISOString().split("T")[0]} /></div>
          <div><Label>Pasandida Time (optional)</Label><Input type="time" value={form.preferred_time} onChange={(e) => setForm({ ...form, preferred_time: e.target.value })} /></div>
          <div><Label>Reason (optional)</Label><Textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Fracture follow-up, Knee pain" /></div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" onClick={handleSubmit} disabled={loading}>
            {loading ? "Bhej rahe hain..." : "Appointment Request Bhejo"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
