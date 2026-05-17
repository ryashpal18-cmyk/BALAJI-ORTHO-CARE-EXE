import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Receipt,
  Plus,
  MessageCircle,
  Printer,
  Trash2,
  Pencil,
  Download,
  Send,
  Eye,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useBills,
  useAddBill,
  usePatients,
  useUpdateBill,
  useDeleteBill,
} from "@/hooks/useDatabase";
import { useState, useCallback, useRef } from "react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";
import html2pdf from "html2pdf.js";
import { openWhatsAppWeb } from "@/pages/WhatsApp";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { MedicineEntryPopup } from "@/components/MedicineEntryPopup";

const statusStyle: Record<string, string> = {
  Paid: "bg-success/10 text-success",
  Pending: "bg-warning/10 text-warning",
  Partial: "bg-info/10 text-info",
};

const SERVICE_OPTIONS = [
  "OPD Consultation",
  "X-Ray",
  "Physiotherapy",
  "Procedure",
  "IPD Stay",
  "Plaster",
  "MOT Charge",
  "Medicine",
  "Dressing",
  "Injection",
  "Blood Test",
  "Other",
];

const toLocalDateInput = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const getMonthStart = (date: Date) =>
  toLocalDateInput(new Date(date.getFullYear(), date.getMonth(), 1));
const getMonthEnd = (date: Date) =>
  toLocalDateInput(new Date(date.getFullYear(), date.getMonth() + 1, 0));
const billDate = (createdAt: string) => toLocalDateInput(new Date(createdAt));

interface ServiceItem {
  name: string;
  amount: string;
}

function getWhatsAppBillMessage(
  patient: string,
  amount: number,
  paid: number,
  billNo: string,
  date: string,
) {
  const due = Math.max(amount - paid, 0);
  const appUrl = `${window.location.origin}/reports`;
  return `नमस्ते ${patient} जी 🙏

Balaji Ortho Care Center में आपका 
स्वागत है।

📋 आपका बिल तैयार है:
🔢 बिल नंबर: ${billNo}
📅 दिनांक: ${date}
💰 कुल राशि: ₹${amount}
✅ जमा: ₹${paid}
❗ बकाया: ₹${due}

━━━━━━━━━━━━━━
🩻 X-Ray रिपोर्ट समझ नहीं आई?

घर बैठे AI से देखें - सिर्फ ₹50 में!
तुरंत आसान भाषा में रिपोर्ट

👇 Click करें:
${appUrl}

धन्यवाद 🙏
Balaji Ortho Care Center`;
}

function getWhatsAppReminderMessage(patient: string, total: number, paid: number, due: number) {
  return `नमस्ते ${patient} जी 🙏
Balaji Ortho Care Center की सूचना।

आपका बिल विवरण:
💰 कुल बिल: ₹${total}
✅ जमा राशि: ₹${paid}
❗ बकाया राशि: ₹${due}

कृपया ₹${due} जल्द जमा करवाएं।

धन्यवाद 🙏
Balaji Ortho Care Center`;
}

function buildInvoiceHTML(bill: any, logoUrl: string = "/images/logo.png") {
  const patientName = (bill.patients as any)?.name || "Patient";
  const patientAge = (bill.patients as any)?.age || "—";
  const patientGender = (bill.patients as any)?.gender || "—";
  const invoiceNo = `INV-${bill.id.slice(0, 8).toUpperCase()}`;
  const date = new Date(bill.created_at).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const services = bill.service.split("|").map((s: string) => {
    const parts = s.trim().split(":");
    return {
      name: parts[0]?.trim() || s.trim(),
      amount: parts[1] ? Number(parts[1].trim()) : Number(bill.amount),
    };
  });
  const totalAmount = services.reduce((sum: number, s: any) => sum + (s.amount || 0), 0);
  const amountPaid = Number((bill as any).amount_paid || 0);
  const dueAmount = totalAmount - amountPaid;
  const paymentMode = (bill as any).payment_mode || "—";

  const serviceRows = services
    .map(
      (s: any, i: number) => `
    <tr>
      <td style="padding:5px 10px;color:#334155;font-size:10px;">${i + 1}</td>
      <td style="padding:5px 10px;color:#334155;font-size:10px;">${s.name}</td>
      <td style="padding:5px 10px;text-align:right;color:#334155;font-size:10px;">₹${Number(s.amount).toLocaleString()}</td>
    </tr>
  `,
    )
    .join("");

  return `
    <div style="
      width: 5.5in;
      min-height: 4.1in;
      box-sizing: border-box;
      position: relative;
      overflow: hidden;
      border: 1.5px solid #e0e0e0;
      border-radius: 8px;
      background: #ffffff;
      font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
      page-break-inside: avoid;
    ">
      <svg style="position:absolute;top:0;left:0;width:180px;height:90px;z-index:0;" viewBox="0 0 220 120" fill="none">
        <path d="M0 0 H220 C180 30 140 80 0 120 Z" fill="#0891b2" opacity="0.13"/>
        <path d="M0 0 H180 C140 25 100 60 0 90 Z" fill="#06b6d4" opacity="0.18"/>
      </svg>
      <svg style="position:absolute;bottom:0;right:0;width:160px;height:80px;z-index:0;" viewBox="0 0 200 100" fill="none">
        <path d="M200 100 H0 C40 70 80 30 200 0 Z" fill="#0891b2" opacity="0.10"/>
        <path d="M200 100 H30 C60 75 100 40 200 15 Z" fill="#06b6d4" opacity="0.14"/>
      </svg>

      <div style="position:relative;z-index:1;padding:12px 16px 10px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <img src="${logoUrl}" style="width:40px;height:40px;object-fit:contain;" alt="Logo" crossorigin="anonymous" />
            <div>
              <div style="font-size:13px;font-weight:800;color:#1e3a5f;">Balaji Ortho Care Center</div>
              <div style="font-size:8px;color:#475569;margin-top:1px;">Dr. S. S. Rathore (DMRT | BPT)</div>
              <div style="font-size:7px;color:#64748b;">Opp Govt Hospital, Bay Pass Road, Khinwara, Raj. – 306502</div>
              <div style="font-size:7px;color:#64748b;">Phone: +91 8005707783</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:16px;font-weight:800;color:#0891b2;letter-spacing:1px;">INVOICE</div>
            <div style="font-size:8px;color:#64748b;margin-top:2px;">${invoiceNo}</div>
            <div style="font-size:8px;color:#64748b;">Date: ${date}</div>
          </div>
        </div>

        <div style="height:1.5px;background:linear-gradient(90deg,#0891b2,#1e3a5f);border-radius:2px;margin-bottom:8px;"></div>

        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <div>
            <div style="font-size:7px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Bill To</div>
            <div style="font-size:11px;font-weight:700;color:#1e3a5f;margin-top:1px;">${patientName}</div>
            <div style="font-size:8px;color:#64748b;">Age: ${patientAge} | Gender: ${patientGender}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:7px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">Status</div>
            <div style="font-size:10px;font-weight:700;color:${bill.status === "Paid" ? "#16a34a" : bill.status === "Pending" ? "#ea580c" : "#0284c7"};margin-top:1px;">${bill.status}</div>
          </div>
        </div>

        <table style="width:100%;border-collapse:collapse;margin-bottom:6px;font-size:10px;">
          <thead>
            <tr style="background:#f0f9ff;">
              <th style="text-align:left;padding:4px 10px;color:#1e3a5f;font-weight:600;border-bottom:1px solid #e2e8f0;font-size:9px;">#</th>
              <th style="text-align:left;padding:4px 10px;color:#1e3a5f;font-weight:600;border-bottom:1px solid #e2e8f0;font-size:9px;">Service</th>
              <th style="text-align:right;padding:4px 10px;color:#1e3a5f;font-weight:600;border-bottom:1px solid #e2e8f0;font-size:9px;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${serviceRows}
          </tbody>
          <tfoot>
            <tr style="border-top:2px solid #0891b2;">
              <td colspan="2" style="padding:4px 10px;font-weight:800;color:#1e3a5f;font-size:10px;">Grand Total</td>
              <td style="padding:4px 10px;text-align:right;font-weight:800;color:#0891b2;font-size:11px;">₹${totalAmount.toLocaleString()}</td>
            </tr>
            <tr>
              <td colspan="2" style="padding:2px 10px;font-size:9px;color:#475569;">Paid (${paymentMode})</td>
              <td style="padding:2px 10px;text-align:right;font-size:9px;color:#16a34a;font-weight:600;">₹${amountPaid.toLocaleString()}</td>
            </tr>
            <tr>
              <td colspan="2" style="padding:2px 10px;font-size:9px;color:#475569;font-weight:700;">Due</td>
              <td style="padding:2px 10px;text-align:right;font-size:9px;color:#ea580c;font-weight:700;">₹${dueAmount.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>

        <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid #e2e8f0;padding-top:5px;">
          <span style="font-size:7px;color:#94a3b8;">Medix Medical Invoice</span>
          <div style="font-size:7px;color:#94a3b8;">Thank you for choosing Balaji Ortho Care Center</div>
        </div>
      </div>
    </div>
  `;
}

function printInvoice(bill: any) {
  const logoUrl = window.location.origin + "/images/logo.png";
  const win = window.open("", "_blank", "width=700,height=1000");
  if (!win) return;
  const invoiceHTML = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Invoice – ${(bill.patients as any)?.name || "Patient"}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Inter', sans-serif; background: #fff; }
      @page { size: 5.5in 8.5in; margin: 5mm; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      .page { width: 5.5in; height: 8.5in; display: flex; flex-direction: column; justify-content: space-between; gap: 4mm; padding: 2mm; margin: 0 auto; }
    </style></head><body>
    <div class="page">${buildInvoiceHTML(bill, logoUrl)}${buildInvoiceHTML(bill, logoUrl)}</div>
    <script>window.onload = function() { window.print(); };</script></body></html>`;
  win.document.write(invoiceHTML);
  win.document.close();
}

function previewInvoice(bill: any) {
  const logoUrl = window.location.origin + "/images/logo.png";
  const win = window.open("", "_blank", "width=700,height=900");
  if (!win) return;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Preview – ${(bill.patients as any)?.name || "Patient"}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Inter', sans-serif; background: #f1f5f9; display:flex; justify-content:center; padding:20px; }
    </style></head><body>${buildInvoiceHTML(bill, logoUrl)}</body></html>`;
  win.document.write(html);
  win.document.close();
}

async function getBase64Image(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

async function generateAndUploadPDF(bill: any): Promise<string | null> {
  const logoUrl = await getBase64Image(window.location.origin + "/images/logo.png");
  const html = buildInvoiceHTML(bill, logoUrl);

  // Create a visible container temporarily to ensure proper rendering
  const container = document.createElement("div");
  container.innerHTML = html;
  container.style.position = "fixed";
  container.style.top = "0";
  container.style.left = "0";
  container.style.zIndex = "-9999";
  container.style.opacity = "0.01";
  container.style.width = "5.5in";
  container.style.background = "#ffffff";
  document.body.appendChild(container);

  // Wait for images to load
  const images = container.querySelectorAll("img");
  await Promise.all(
    Array.from(images).map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => resolve();
          setTimeout(resolve, 3000);
        }),
    ),
  );

  // Small delay for fonts and rendering
  await new Promise((r) => setTimeout(r, 500));

  try {
    const pdfBlob = await html2pdf()
      .set({
        margin: [2, 2, 2, 2],
        filename: "invoice.pdf",
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 3,
          useCORS: true,
          allowTaint: true,
          logging: false,
          backgroundColor: "#ffffff",
          width: container.scrollWidth,
          height: container.scrollHeight,
        },
        jsPDF: { unit: "in", format: [5.5, 8.5], orientation: "portrait" },
      })
      .from(container)
      .outputPdf("blob");

    const invoiceNo = `INV-${bill.id.slice(0, 8).toUpperCase()}`;
    const fileName = `${invoiceNo}-${Date.now()}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from("invoices")
      .upload(fileName, pdfBlob, { contentType: "application/pdf", upsert: true });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return null;
    }

    const { data: urlData } = supabase.storage.from("invoices").getPublicUrl(fileName);
    await supabase
      .from("billing")
      .update({ invoice_pdf_url: urlData.publicUrl } as any)
      .eq("id", bill.id);

    return urlData.publicUrl;
  } catch (err) {
    console.error("PDF generation error:", err);
    return null;
  } finally {
    document.body.removeChild(container);
  }
}

export default function Billing() {
  const { data: bills, isLoading } = useBills();
  const { data: patients } = usePatients();
  const addBill = useAddBill();
  const updateBill = useUpdateBill();
  const deleteBill = useDeleteBill();
  const { isAdmin } = useIsAdmin();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<any>(null);
  const [medPopup, setMedPopup] = useState<{ open: boolean; patientName: string; invoiceNo: string }>({
    open: false, patientName: "", invoiceNo: "",
  });
  const [selectedPatient, setSelectedPatient] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [services, setServices] = useState<ServiceItem[]>([{ name: "", amount: "" }]);
  const [amountPaid, setAmountPaid] = useState("");
  const [paymentMode, setPaymentMode] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [rangeMode, setRangeMode] = useState("today");
  const [fromDate, setFromDate] = useState(toLocalDateInput(new Date()));
  const [toDate, setToDate] = useState(toLocalDateInput(new Date()));
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyRangeMode = (mode: string) => {
    const today = new Date();
    setRangeMode(mode);
    if (mode === "today") {
      const iso = toLocalDateInput(today);
      setFromDate(iso);
      setToDate(iso);
    }
    if (mode === "month") {
      setFromDate(getMonthStart(today));
      setToDate(getMonthEnd(today));
    }
  };

  const filteredBills = (bills || []).filter((bill) => {
    const date = billDate(bill.created_at);
    return date >= fromDate && date <= toDate;
  });

  const cashTally = filteredBills.reduce(
    (acc, bill) => {
      const amount = Number(bill.amount || 0);
      const paid = Number((bill as any).amount_paid || 0);
      acc.total += amount;
      acc.received += paid;
      acc.pending += Math.max(amount - paid, 0);
      return acc;
    },
    { total: 0, received: 0, pending: 0 },
  );

  const filteredPatients = patients?.filter((p) => {
    if (!patientSearch) return true;
    const q = patientSearch.toLowerCase();
    return (
      p.name?.toLowerCase().includes(q) || p.mobile?.includes(patientSearch.replace(/\D/g, ""))
    );
  });

  const addServiceRow = () => setServices((prev) => [...prev, { name: "", amount: "" }]);
  const removeServiceRow = (idx: number) => setServices((prev) => prev.filter((_, i) => i !== idx));
  const updateService = (idx: number, field: keyof ServiceItem, value: string) => {
    setServices((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

  const totalAmount = services.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
  const paidNum = parseFloat(amountPaid) || 0;
  const dueAmount = totalAmount - paidNum;

  const computeStatus = () => {
    if (paidNum <= 0) return "Pending";
    if (paidNum >= totalAmount) return "Paid";
    return "Partial";
  };

  const handleDeleteBill = useCallback(
    async (bill: any) => {
      try {
        // Delete PDF from storage if exists
        const pdfUrl = (bill as any).invoice_pdf_url;
        if (pdfUrl) {
          const urlParts = pdfUrl.split("/invoices/");
          if (urlParts[1]) {
            await supabase.storage.from("invoices").remove([urlParts[1]]);
          }
        }

        await deleteBill.mutateAsync({ id: bill.id, logData: bill });

        const { dismiss } = toast({
          title: "🗑️ Bill Deleted",
          description: (
            <div className="flex items-center gap-2">
              <span>Invoice deleted successfully</span>
            </div>
          ),
          duration: 10000,
        });
      } catch (err: any) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    },
    [deleteBill],
  );

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const validServices = services.filter((s) => s.name && s.amount);
    if (!selectedPatient || validServices.length === 0) {
      toast({
        title: "Error",
        description: "Patient और कम से कम एक service ज़रूरी है",
        variant: "destructive",
      });
      return;
    }
    setIsSending(true);
    try {
      const serviceStr = validServices.map((s) => `${s.name}:${s.amount}`).join("|");
      const status = computeStatus();
      const result = await addBill.mutateAsync({
        patient_id: selectedPatient,
        service: serviceStr,
        amount: totalAmount,
        status,
        amount_paid: paidNum,
        payment_mode: paymentMode || null,
      } as any);

      toast({ title: "✅ Bill Saved", description: "Bill successfully save ho gaya" });

      const patient = result.patients as any;
      const patientName = patient?.name || "Patient";

      setSelectedPatient("");
      setServices([{ name: "", amount: "" }]);
      setAmountPaid("");
      setPaymentMode("");
      setOpen(false);

      setMedPopup({
        open: true,
        patientName: patientName,
        invoiceNo: `INV-${result.id.slice(0, 8).toUpperCase()}`,
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  const handleResendWhatsApp = async (bill: any) => {
    const patient = bill.patients as any;
    const mobile = patient?.mobile || "";
    const patientName = patient?.name || "Patient";
    if (!mobile) {
      toast({
        title: "Error",
        description: "Patient का mobile number नहीं है",
        variant: "destructive",
      });
      return;
    }

    if (!(bill as any).invoice_pdf_url) {
      toast({ title: "Generating PDF...", description: "Please wait" });
      await generateAndUploadPDF(bill);
    }
    const msg = getWhatsAppBillMessage(
      patientName,
      Number(bill.amount),
      Number((bill as any).amount_paid || 0),
      `INV-${bill.id.slice(0, 8).toUpperCase()}`,
      new Date(bill.created_at).toLocaleDateString("en-IN"),
    );
    openWhatsAppWeb(mobile, msg);
  };

  const handleEdit = (bill: any) => {
    setEditingBill(bill);
    const parsedServices = bill.service.split("|").map((s: string) => {
      const parts = s.trim().split(":");
      return { name: parts[0]?.trim() || "", amount: parts[1]?.trim() || String(bill.amount) };
    });
    setServices(parsedServices);
    setAmountPaid(String((bill as any).amount_paid || 0));
    setPaymentMode((bill as any).payment_mode || "");
    setEditOpen(true);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBill) return;
    const validServices = services.filter((s) => s.name && s.amount);
    if (validServices.length === 0) {
      toast({
        title: "Error",
        description: "कम से कम एक service ज़रूरी है",
        variant: "destructive",
      });
      return;
    }
    setIsSending(true);
    try {
      const serviceStr = validServices.map((s) => `${s.name}:${s.amount}`).join("|");
      const newTotal = validServices.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
      const status = computeStatus();
      await updateBill.mutateAsync({
        id: editingBill.id,
        service: serviceStr,
        amount: newTotal,
        status,
        amount_paid: paidNum,
        payment_mode: paymentMode || null,
      } as any);

      const updatedBill = {
        ...editingBill,
        service: serviceStr,
        amount: newTotal,
        status,
        amount_paid: paidNum,
        payment_mode: paymentMode,
      };
      await generateAndUploadPDF(updatedBill);

      const patient = editingBill.patients as any;
      const mobile = patient?.mobile || "";
      const patientName = patient?.name || "Patient";

      if (mobile) {
        const msg = getWhatsAppBillMessage(
          patientName,
          newTotal,
          paidNum,
          `INV-${editingBill.id.slice(0, 8).toUpperCase()}`,
          new Date(editingBill.created_at).toLocaleDateString("en-IN"),
        );
        openWhatsAppWeb(mobile, msg);
      }

      toast({ title: "Success", description: "Bill updated & WhatsApp sent!" });
      setEditOpen(false);
      setEditingBill(null);
      setServices([{ name: "", amount: "" }]);
      setAmountPaid("");
      setPaymentMode("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  const exportToExcel = () => {
    if (filteredBills.length === 0) {
      toast({
        title: "No data",
        description: "कोई bill data नहीं है export करने के लिए",
        variant: "destructive",
      });
      return;
    }
    const data = filteredBills.map((bill) => {
      const patient = bill.patients as any;
      const displayService = bill.service.includes("|")
        ? bill.service
            .split("|")
            .map((s: string) => s.split(":")[0].trim())
            .join(", ")
        : bill.service;
      return {
        "Patient Name": patient?.name || "",
        Mobile: patient?.mobile || "",
        "Village/Address": patient?.address || "",
        Service: displayService,
        "Amount (₹)": Number(bill.amount),
        "Paid (₹)": Number((bill as any).amount_paid || 0),
        "Due (₹)": Number(bill.amount) - Number((bill as any).amount_paid || 0),
        "Payment Mode": (bill as any).payment_mode || "",
        Status: bill.status,
        Date: new Date(bill.created_at).toLocaleDateString("en-IN"),
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Patient Bills");
    XLSX.writeFile(wb, `Patient_Bills_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast({ title: "Exported!", description: "Excel file download हो गई" });
  };

  const renderServiceForm = () => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Services</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addServiceRow}
          className="h-7 text-xs gap-1"
        >
          <Plus className="h-3 w-3" /> Add Service
        </Button>
      </div>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {services.map((s, idx) => (
          <div key={idx} className="flex gap-2 items-center">
            <Select value={s.name} onValueChange={(v) => updateService(idx, "name", v)}>
              <SelectTrigger className="flex-1 h-9">
                <SelectValue placeholder="Service" />
              </SelectTrigger>
              <SelectContent>
                {SERVICE_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              placeholder="₹"
              className="w-24 h-9"
              value={s.amount}
              onChange={(e) => updateService(idx, "amount", e.target.value)}
            />
            {services.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                onClick={() => removeServiceRow(idx)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const renderPaymentSection = () => (
    <div className="space-y-3">
      <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
        <span className="text-sm font-medium">Total Amount</span>
        <span className="text-lg font-bold text-primary">₹{totalAmount.toLocaleString()}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Payment Mode</Label>
          <Select value={paymentMode} onValueChange={setPaymentMode}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Cash">Cash</SelectItem>
              <SelectItem value="UPI">UPI</SelectItem>
              <SelectItem value="Card">Card</SelectItem>
              <SelectItem value="Online">Online</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Amount Paid (₹)</Label>
          <Input
            type="number"
            placeholder="0"
            className="h-9"
            value={amountPaid}
            onChange={(e) => setAmountPaid(e.target.value)}
          />
        </div>
      </div>
      <div className="flex justify-between items-center p-2 rounded-lg border border-dashed">
        <span className="text-xs font-medium text-muted-foreground">Due Amount</span>
        <span
          className={cn("text-sm font-bold", dueAmount > 0 ? "text-destructive" : "text-success")}
        >
          ₹{dueAmount.toLocaleString()}
        </span>
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="module-header">Billing</h1>
            <p className="text-sm text-muted-foreground">Manage invoices, receipts, and payments</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" onClick={exportToExcel}>
              <Download className="h-4 w-4" /> Excel Export
            </Button>
            <Dialog
              open={open}
              onOpenChange={(v) => {
                setOpen(v);
                if (!v) {
                  setServices([{ name: "", amount: "" }]);
                  setAmountPaid("");
                  setPaymentMode("");
                  setPatientSearch("");
                }
              }}
            >
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  New Bill
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle className="font-heading">New Bill</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAdd} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Patient (Search by name or mobile)</Label>
                    <Input
                      placeholder="🔍 Type name or mobile number..."
                      value={patientSearch}
                      onChange={(e) => setPatientSearch(e.target.value)}
                      className="mb-2"
                    />
                    <Select value={selectedPatient} onValueChange={setSelectedPatient}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select patient" />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredPatients?.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} ({p.mobile || "No mobile"})
                          </SelectItem>
                        ))}
                        {filteredPatients?.length === 0 && (
                          <div className="px-3 py-2 text-xs text-muted-foreground">
                            No patients found
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  {renderServiceForm()}
                  {renderPaymentSection()}
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={addBill.isPending || isSending}
                  >
                    {isSending
                      ? "Saving..."
                      : addBill.isPending
                        ? "Creating..."
                        : "💾 Save Bill"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              Cash Tally / Date Wise Billing
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-4 gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs">Filter</Label>
                <Select value={rangeMode} onValueChange={applyRangeMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Aaj ki date</SelectItem>
                    <SelectItem value="month">Is month</SelectItem>
                    <SelectItem value="custom">Custom date</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">From Date</Label>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setRangeMode("custom");
                    setFromDate(e.target.value);
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To Date</Label>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setRangeMode("custom");
                    setToDate(e.target.value);
                  }}
                />
              </div>
              <div className="rounded-lg bg-muted/40 p-3 text-sm">
                <p className="text-xs text-muted-foreground">Bills count</p>
                <p className="font-bold text-primary">{filteredBills.length}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-primary/10 p-3">
                <p className="text-xs text-muted-foreground">Total Amount</p>
                <b className="text-primary">₹{cashTally.total.toLocaleString()}</b>
              </div>
              <div className="rounded-lg bg-success/10 p-3">
                <p className="text-xs text-muted-foreground">Aaya / Paid</p>
                <b className="text-success">₹{cashTally.received.toLocaleString()}</b>
              </div>
              <div className="rounded-lg bg-warning/10 p-3">
                <p className="text-xs text-muted-foreground">Baki / Due</p>
                <b className="text-warning">₹{cashTally.pending.toLocaleString()}</b>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Edit Bill Dialog */}
        <Dialog
          open={editOpen}
          onOpenChange={(v) => {
            setEditOpen(v);
            if (!v) {
              setEditingBill(null);
              setServices([{ name: "", amount: "" }]);
              setAmountPaid("");
              setPaymentMode("");
            }
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-heading">Edit Bill</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEditSave} className="space-y-4">
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-sm font-medium">
                  Patient:{" "}
                  <span className="text-primary">{(editingBill?.patients as any)?.name}</span>
                </p>
              </div>
              {renderServiceForm()}
              {renderPaymentSection()}
              <Button type="submit" className="w-full" disabled={updateBill.isPending || isSending}>
                {isSending
                  ? "Saving & sending..."
                  : updateBill.isPending
                    ? "Saving..."
                    : "💾 Save Changes & Send WhatsApp"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              Date Wise Bills ({fromDate} to {toDate})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground text-sm">Loading...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-xs">
                      <th className="text-left py-2 font-medium">Patient</th>
                      <th className="text-left py-2 font-medium hidden sm:table-cell">Service</th>
                      <th className="text-right py-2 font-medium">Amount</th>
                      <th className="text-right py-2 font-medium hidden sm:table-cell">Paid</th>
                      <th className="text-right py-2 font-medium hidden sm:table-cell">Due</th>
                      <th className="text-center py-2 font-medium">Status</th>
                      <th className="text-right py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBills.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-muted-foreground">
                          Selected date range me koi bill nahi hai
                        </td>
                      </tr>
                    )}
                    {filteredBills.map((bill) => {
                      const patient = bill.patients as any;
                      const displayService = bill.service.includes("|")
                        ? bill.service
                            .split("|")
                            .map((s: string) => s.split(":")[0].trim())
                            .join(", ")
                        : bill.service;
                      const paid = Number((bill as any).amount_paid || 0);
                      const due = Number(bill.amount) - paid;
                      return (
                        <tr key={bill.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-3 font-medium">{patient?.name}</td>
                          <td className="py-3 hidden sm:table-cell text-muted-foreground text-xs">
                            {displayService}
                          </td>
                          <td className="py-3 text-right font-medium">
                            ₹{Number(bill.amount).toLocaleString()}
                          </td>
                          <td className="py-3 text-right hidden sm:table-cell text-success font-medium">
                            ₹{paid.toLocaleString()}
                          </td>
                          <td className="py-3 text-right hidden sm:table-cell text-destructive font-medium">
                            {due > 0 ? `₹${due.toLocaleString()}` : "—"}
                          </td>
                          <td className="py-3 text-center">
                            <Select
                              value={bill.status}
                              onValueChange={(v) =>
                                updateBill.mutate({ id: bill.id, status: v } as any)
                              }
                            >
                              <SelectTrigger
                                className={cn(
                                  "h-7 w-20 text-[10px] border-0 mx-auto",
                                  statusStyle[bill.status] || "",
                                )}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Pending">Pending</SelectItem>
                                <SelectItem value="Paid">Paid</SelectItem>
                                <SelectItem value="Partial">Partial</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="py-3 text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => previewInvoice(bill)}
                                title="Preview Invoice"
                              >
                                <Eye className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleEdit(bill)}
                                title="Edit Bill"
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => printInvoice(bill)}
                                title="Print"
                              >
                                <Printer className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-success"
                                onClick={() => handleResendWhatsApp(bill)}
                                title="Resend WhatsApp"
                              >
                                <MessageCircle className="h-3 w-3" />
                              </Button>
                              {bill.status !== "Paid" && patient?.mobile && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-warning"
                                  title="Payment Reminder"
                                  onClick={() => {
                                    const due = Math.max(Number(bill.amount) - paid, 0);
                                    const msg = getWhatsAppReminderMessage(
                                      patient?.name || "",
                                      Number(bill.amount),
                                      paid,
                                      due,
                                    );
                                    openWhatsAppWeb(patient?.mobile || "", msg);
                                  }}
                                >
                                  <Send className="h-3 w-3" />
                                </Button>
                              )}
                              {isAdmin && (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-destructive"
                                      title="Delete Bill"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>
                                        Are you sure you want to delete this invoice?
                                      </AlertDialogTitle>
                                      <AlertDialogDescription>
                                        {patient?.name} का invoice (₹
                                        {Number(bill.amount).toLocaleString()}) permanently delete
                                        हो जाएगा। PDF file भी delete होगी।
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleDeleteBill(bill)}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        Delete Invoice
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <MedicineEntryPopup
        open={medPopup.open}
        onClose={() => setMedPopup((p) => ({ ...p, open: false }))}
        patientName={medPopup.patientName}
        invoiceNo={medPopup.invoiceNo}
      />
    </DashboardLayout>
  );
}
