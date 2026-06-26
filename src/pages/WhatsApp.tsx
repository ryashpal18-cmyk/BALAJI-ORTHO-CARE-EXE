import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageCircle, Send, Users, ExternalLink } from "lucide-react";
import { useState } from "react";
import { usePatients } from "@/hooks/useDatabase";
import { toast } from "@/hooks/use-toast";

const TEMPLATES: Record<string, string> = {
  welcome: `🙏 Namaste [NAME],\n\nBalaji Ortho Care Center में आपका स्वागत है!\n\n👨‍⚕️ Dr. S. S. Rathore (DMRT | BPT)\n📍 Opp Govt Hospital, Bay Pass Road, Khinwara, Raj. – 306502\n📞 +91 8005707783\n\n🌐 Online Reports & Appointments:\nhttps://balaji-health-hub.lovable.app/\n\nधन्यवाद! 🙏`,
  reminder: `Namaste [NAME],\n\nBalaji Ortho Care Center se nivedan hai ki aapka payment pending hai.\nKripya clinic par jama karein.\n\n📞 +91 8005707783\n🌐 https://balaji-health-hub.lovable.app/\n\nDhanyawad! 🙏`,
  followup: `🙏 Namaste [NAME],\n\nAapka follow-up visit Balaji Ortho Care Center mein due hai.\nKripya appointment lein.\n\n📞 +91 8005707783\n🌐 https://balaji-health-hub.lovable.app/\n\nDhanyawad!`,
  custom: "",
};

// ✅ IPC ke through Electron main process ko WhatsApp window open karne bolna
export function openWhatsAppWeb(mobile: string, message: string) {
  const cleanMobile = mobile?.replace(/\D/g, "") || "";
  const num = cleanMobile.startsWith("91") ? cleanMobile : `91${cleanMobile}`;
  const url = `https://web.whatsapp.com/send?phone=${num}&text=${encodeURIComponent(message)}`;

  // Electron mein IPC se bhejo
  if ((window as any).ipcRenderer) {
    (window as any).ipcRenderer.send("open-whatsapp", { url });
  } else if ((window as any).electron?.openExternal) {
    // fallback: electron.openExternal se default browser mein kholo
    (window as any).electron.openExternal(url);
  } else {
    // Browser fallback (dev mein)
    window.open(url, "whatsapp_web_window", "width=1000,height=700,scrollbars=yes,resizable=yes");
  }
}

export default function WhatsApp() {
  const { data: patients } = usePatients();
  const [selectedPatient, setSelectedPatient] = useState("");
  const [manualNumber, setManualNumber] = useState("");
  const [template, setTemplate] = useState("welcome");
  const [message, setMessage] = useState(TEMPLATES.welcome);

  const selectedPatientData = patients?.find(p => p.id === selectedPatient);

  const handleTemplateChange = (t: string) => {
    setTemplate(t);
    const patientName = selectedPatientData?.name || "[NAME]";
    setMessage(TEMPLATES[t]?.replace(/\[NAME\]/g, patientName) || "");
  };

  const handlePatientChange = (id: string) => {
    setSelectedPatient(id);
    const patient = patients?.find(p => p.id === id);
    if (patient) {
      setManualNumber(patient.mobile || "");
      setMessage(prev => prev.replace(/\[NAME\]/g, patient.name));
    }
  };

  const handleSend = () => {
    const number = manualNumber || selectedPatientData?.mobile || "";
    if (!number) {
      toast({ title: "Error", description: "Mobile number ज़रूरी है", variant: "destructive" });
      return;
    }
    if (!message.trim()) {
      toast({ title: "Error", description: "Message लिखें", variant: "destructive" });
      return;
    }
    openWhatsAppWeb(number, message);
    toast({ title: "✅ WhatsApp Web Opened", description: "Same window mein message ready hai" });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 page-enter">
        <div>
          <h1 className="module-header flex items-center gap-2">
            <MessageCircle className="h-6 w-6 text-green-500" />
            WhatsApp Messaging
          </h1>
          <p className="text-sm text-muted-foreground">
            WhatsApp Web से patients को directly message भेजें
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Send Message Card */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-base flex items-center gap-2">
                <Send className="h-4 w-4 text-green-500" />
                Send Message
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Patient Select करें</Label>
                <Select value={selectedPatient} onValueChange={handlePatientChange}>
                  <SelectTrigger><SelectValue placeholder="Patient चुनें" /></SelectTrigger>
                  <SelectContent>
                    {patients?.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} {p.mobile ? `(${p.mobile})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>या Manual Number डालें</Label>
                <Input
                  placeholder="Mobile number"
                  value={manualNumber}
                  onChange={e => setManualNumber(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Template</Label>
                <Select value={template} onValueChange={handleTemplateChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="welcome">🙏 Welcome Message</SelectItem>
                    <SelectItem value="reminder">💰 Payment Reminder</SelectItem>
                    <SelectItem value="followup">📅 Follow-up Reminder</SelectItem>
                    <SelectItem value="custom">✏️ Custom Message</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea
                  rows={8}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="अपना message यहाँ लिखें..."
                />
              </div>

              <Button onClick={handleSend} className="w-full gap-2 bg-green-600 hover:bg-green-700">
                <MessageCircle className="h-4 w-4" />
                WhatsApp Web से भेजें
              </Button>
            </CardContent>
          </Card>

          {/* Quick Send to Recent Patients */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Recent Patients - Quick Send
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {patients?.slice(0, 20).map(p => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.mobile || "No mobile"}</p>
                    </div>
                    {p.mobile && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-green-600 hover:text-green-700 hover:bg-green-50 gap-1 flex-shrink-0"
                        onClick={() => {
                          const welcomeMsg = TEMPLATES.welcome.replace(/\[NAME\]/g, p.name);
                          openWhatsAppWeb(p.mobile!, welcomeMsg);
                        }}
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Send</span>
                      </Button>
                    )}
                  </div>
                ))}
                {(!patients || patients.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-8">कोई patient नहीं मिला</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* WhatsApp Web Info */}
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <ExternalLink className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-800">WhatsApp Web कैसे use करें?</p>
                <ul className="text-xs text-green-700 mt-1 space-y-1 list-disc pl-4">
                  <li>पहली बार — WhatsApp Web window खुलेगी, QR code scan करें</li>
                  <li>एक बार login के बाद, हर बार same window में message ready होगा</li>
                  <li>Window बंद करने पर भी login रहेगा — बार बार scan नहीं करना</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
