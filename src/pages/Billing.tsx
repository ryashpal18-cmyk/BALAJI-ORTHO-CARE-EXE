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
import { useLocation } from "react-router-dom";
import {
  useBills,
  useAddBill,
  usePatients,
  useUpdateBill,
  useDeleteBill,
} from "@/hooks/useDatabase";
import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { isOnline } from "@/lib/offlineSync";
import { cLog } from "@/lib/clientLogger";
import * as XLSX from "xlsx";
// html2pdf: dynamic import only when needed (top-level import causes Electron crash)
import { openWhatsAppWeb } from "@/pages/WhatsApp";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { sendSMS } from "@/services/smsService";
import { getServiceCatalog, learnServiceItems } from "@/lib/appConfig";
import { useAddFractureCase } from "@/hooks/useOrtho";

// ✅ Safe date helper - "Invalid time value" crash se bachao
const safeDate = (val: any): string => {
  if (!val) return "—";
  const d = new Date(val);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN");
};

const statusStyle: Record<string, string> = {
  Paid: "bg-success/10 text-success",
  Pending: "bg-warning/10 text-warning",
  Partial: "bg-info/10 text-info",
};

const toLocalDateInput = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const getMonthStart = (date: Date) =>
  toLocalDateInput(new Date(date.getFullYear(), date.getMonth(), 1));
const getMonthEnd = (date: Date) =>
  toLocalDateInput(new Date(date.getFullYear(), date.getMonth() + 1, 0));
const billDate = (createdAt: string) => {
  if (!createdAt) return toLocalDateInput(new Date());
  const d = new Date(createdAt);
  if (isNaN(d.getTime())) return toLocalDateInput(new Date());
  return toLocalDateInput(d);
};

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
  pdfUrl?: string | null,
) {
  const due = Math.max(amount - paid, 0);
  const appUrl = `${window.location.origin}/reports`;
  const pdfLine = pdfUrl ? `\n📄 बिल PDF Download करें:\n${pdfUrl}\n` : "";
  return `नमस्ते ${patient} जी 🙏

Balaji Ortho Care Center में आपका 
स्वागत है।

📋 आपका बिल तैयार है:
🔢 बिल नंबर: ${billNo}
📅 दिनांक: ${date}
💰 कुल राशि: ₹${amount}
✅ जमा: ₹${paid}
❗ बकाया: ₹${due}${pdfLine}
━━━━━━━━━━━━━━
🌐 हमारी वेबसाइट:
https://balaji-health-hub.lovable.app
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
  const _dateObj = bill.created_at ? new Date(bill.created_at) : new Date();
  const date = (!bill.created_at || isNaN(_dateObj.getTime()) ? new Date() : _dateObj).toLocaleDateString("en-IN", {
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
  const discountAmt = Number((bill as any).discount || 0);
  const dueAmount = Math.max(totalAmount - discountAmt - amountPaid, 0);
  const finalTotal = totalAmount - discountAmt;
  const paymentMode = (bill as any).payment_mode || "—";

  const serviceRows = services
    .map(
      (s: any, i: number) => `
    <tr>
      <td style="padding:4px 8px;color:#1e293b;font-size:10.5px;font-weight:500;">${i + 1}</td>
      <td style="padding:4px 8px;color:#1e293b;font-size:10.5px;font-weight:500;">${s.name}</td>
      <td style="padding:4px 8px;text-align:right;color:#1e293b;font-size:10.5px;font-weight:600;">₹${Number(s.amount).toLocaleString()}</td>
    </tr>
  `,
    )
    .join("");

  const discountRow = discountAmt > 0 ? `
    <tr style="background:#fef9c3;">
      <td colspan="2" style="padding:4px 8px;font-size:10px;color:#854d0e;font-weight:700;">
        🎁 Special Discount
      </td>
      <td style="padding:4px 8px;text-align:right;font-size:10px;color:#854d0e;font-weight:700;">
        − ₹${discountAmt.toLocaleString()}
      </td>
    </tr>
  ` : "";

  const statusColor = bill.status === "Paid" ? "#16a34a" : bill.status === "Pending" ? "#dc2626" : "#0891b2";
  const statusBg = bill.status === "Paid" ? "#f0fdf4" : bill.status === "Pending" ? "#fef2f2" : "#f0f9ff";

  return `
    <div style="
      width: 210mm;
      min-height: 140mm;
      box-sizing: border-box;
      position: relative;
      overflow: hidden;
      border: 2px solid #cbd5e1;
      border-radius: 10px;
      background: #ffffff;
      font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
      page-break-inside: avoid;
    ">
      <!-- Top gradient background strip -->
      <div style="position:absolute;top:0;left:0;right:0;height:48px;background:linear-gradient(135deg,#1e3a5f 0%,#0891b2 60%,#06b6d4 100%);z-index:0;"></div>
      <!-- Decorative corner arc bottom-right -->
      <svg style="position:absolute;bottom:0;right:0;width:120px;height:70px;z-index:0;" viewBox="0 0 150 90" fill="none">
        <path d="M150 90 H0 C50 65 100 30 150 0 Z" fill="#0891b2" opacity="0.08"/>
        <path d="M150 90 H40 C75 68 115 38 150 12 Z" fill="#1e3a5f" opacity="0.07"/>
      </svg>

      <!-- HEADER -->
      <div style="position:relative;z-index:1;padding:8px 14px 6px;display:flex;justify-content:space-between;align-items:center;">
        <div style="display:flex;align-items:center;gap:10px;">
          <img src="${logoUrl}" style="width:36px;height:36px;object-fit:contain;border-radius:6px;background:#fff;padding:2px;" alt="Logo" crossorigin="anonymous" />
          <div>
            <div style="font-size:14px;font-weight:800;color:#ffffff;letter-spacing:0.3px;">Balaji Ortho Care Center</div>
            <div style="font-size:8px;color:#bae6fd;margin-top:1px;">Dr. S. S. Rathore (DMRT | BPT) &nbsp;|&nbsp; Khinwara, Raj. – 306502</div>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:18px;font-weight:900;color:#ffffff;letter-spacing:2px;line-height:1;">INVOICE</div>
          <div style="font-size:8px;color:#bae6fd;margin-top:2px;">${invoiceNo} &nbsp;|&nbsp; ${date}</div>
        </div>
      </div>

      <!-- BODY -->
      <div style="padding:8px 14px 8px;">

        <!-- Patient + Status row -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:7px;">
          <div>
            <div style="font-size:8px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;font-weight:600;">Patient</div>
            <div style="font-size:13px;font-weight:800;color:#1e3a5f;margin-top:1px;">${patientName}</div>
            <div style="font-size:9px;color:#475569;font-weight:500;">Age: ${patientAge} &nbsp;|&nbsp; ${patientGender}</div>
          </div>
          <div style="background:${statusBg};border:1.5px solid ${statusColor};border-radius:6px;padding:4px 10px;text-align:center;">
            <div style="font-size:8px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;">Status</div>
            <div style="font-size:12px;font-weight:800;color:${statusColor};">${bill.status}</div>
          </div>
        </div>

        <!-- Services Table -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:5px;">
          <thead>
            <tr style="background:#f8fafc;border-top:2px solid #0891b2;border-bottom:1.5px solid #e2e8f0;">
              <th style="text-align:left;padding:4px 8px;color:#1e3a5f;font-weight:700;font-size:9px;width:24px;">#</th>
              <th style="text-align:left;padding:4px 8px;color:#1e3a5f;font-weight:700;font-size:9px;">Service / Description</th>
              <th style="text-align:right;padding:4px 8px;color:#1e3a5f;font-weight:700;font-size:9px;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${serviceRows}
          </tbody>
          <tfoot>
            ${discountRow}
            <tr style="border-top:2px solid #0891b2;background:#f0f9ff;">
              <td colspan="2" style="padding:5px 8px;font-weight:800;color:#1e3a5f;font-size:11px;">Grand Total</td>
              <td style="padding:5px 8px;text-align:right;font-weight:900;color:#0891b2;font-size:13px;">₹${finalTotal.toLocaleString()}</td>
            </tr>
            <tr style="border-bottom:1px solid #e2e8f0;">
              <td colspan="2" style="padding:3px 8px;font-size:9.5px;color:#475569;">Paid &nbsp;<span style="color:#94a3b8;">(${paymentMode})</span></td>
              <td style="padding:3px 8px;text-align:right;font-size:9.5px;color:#16a34a;font-weight:700;">₹${amountPaid.toLocaleString()}</td>
            </tr>
            <tr>
              <td colspan="2" style="padding:3px 8px;font-size:9.5px;color:#dc2626;font-weight:700;">Due Amount</td>
              <td style="padding:3px 8px;text-align:right;font-size:10px;color:#dc2626;font-weight:800;">₹${dueAmount.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>

        <!-- Footer -->
        <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid #e2e8f0;padding-top:4px;margin-top:2px;">
          <span style="font-size:7.5px;color:#94a3b8;">📞 +91 8005707783 &nbsp;|&nbsp; Opp Govt Hospital, Bay Pass Road, Khinwara</span>
          <span style="font-size:7.5px;color:#0891b2;font-weight:600;">Thank you for your trust 🙏</span>
        </div>
      </div>
    </div>
  `;
}

function printInvoice(bill: any) {
  const logoUrl = window.location.origin + "/images/logo.png";
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  const invoiceHTML = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Invoice – ${(bill.patients as any)?.name || "Patient"}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Inter', sans-serif; background: #f8fafc; }
      @page { size: A4 landscape; margin: 8mm; }
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #fff; }
        .no-print { display: none; }
      }
      .page {
        width: 277mm;
        display: flex;
        flex-direction: row;
        gap: 6mm;
        padding: 0;
        margin: 0 auto;
      }
      .invoice-wrap { flex: 1; }
      .divider {
        width: 1px;
        background: repeating-linear-gradient(to bottom, #cbd5e1 0, #cbd5e1 5px, transparent 5px, transparent 10px);
        flex-shrink: 0;
      }
      .print-btn {
        display: block;
        margin: 8px auto 0;
        padding: 6px 18px;
        background: #0891b2;
        color: #fff;
        border: none;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
      }
    </style></head><body>
    <div class="no-print" style="text-align:center;padding:6px;">
      <button class="print-btn" onclick="window.print()">🖨️ Print A4 (2 Copies)</button>
      <span style="font-size:11px;color:#64748b;margin-left:10px;">A4 Landscape → 2 Patient Copies</span>
    </div>
    <div class="page">
      <div class="invoice-wrap">${buildInvoiceHTML(bill, logoUrl)}</div>
      <div class="divider"></div>
      <div class="invoice-wrap">${buildInvoiceHTML(bill, logoUrl)}</div>
    </div>
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

  // ✅ Container bilkul screen se bahar rakho — white screen nahi aayegi
  const container = document.createElement("div");
  container.innerHTML = html;
  container.style.position = "absolute";
  container.style.top = "-9999px";
  container.style.left = "-9999px";
  container.style.width = "210mm";
  container.style.background = "#ffffff";
  container.style.pointerEvents = "none";
  container.style.visibility = "hidden";
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
    // Dynamic import — Electron mein top-level import crash karta tha
    const { default: html2pdf } = await import("html2pdf.js");
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
        jsPDF: { unit: "mm", format: [210, 148], orientation: "landscape" },
      })
      .from(container)
      .outputPdf("blob");

    const invoiceNo = `INV-${bill.id.slice(0, 8).toUpperCase()}`;
    const fileName = `${invoiceNo}-${Date.now()}.pdf`;

    // PDF upload sirf online ho tab karo — offline ho to silently skip
    const online = await isOnline();
    if (!online) return null;

    const { error: uploadError } = await supabase.storage
      .from("invoices")
      .upload(fileName, pdfBlob, { contentType: "application/pdf", upsert: true });

    if (uploadError) return null; // upload fail — koi error nahi dikhana

    const { data: urlData } = supabase.storage.from("invoices").getPublicUrl(fileName);
    try {
      await supabase
        .from("billing")
        .update({ invoice_pdf_url: urlData.publicUrl } as any)
        .eq("id", bill.id);
    } catch { /* URL save fail hona koi badi baat nahi */ }

    return urlData.publicUrl;
  } catch (err) {
    cLog.error("billing", "PDF generation fail", err); return null;
  } finally {
    document.body.removeChild(container);
  }
}

export default function Billing() {
  const location = useLocation();
  const { data: bills, isLoading } = useBills();
  const { data: patients } = usePatients();
  const addBill = useAddBill();
  const addFractureCase = useAddFractureCase();
  const updateBill = useUpdateBill();
  const deleteBill = useDeleteBill();
  const { isAdmin } = useIsAdmin();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<any>(null);

  const [selectedPatient, setSelectedPatient] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [services, setServices] = useState<ServiceItem[]>([{ name: "", amount: "" }]);
  const [amountPaid, setAmountPaid] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [rangeMode, setRangeMode] = useState("today");
  const [fromDate, setFromDate] = useState(toLocalDateInput(new Date()));
  const [toDate, setToDate] = useState(toLocalDateInput(new Date()));
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navPatientConsumedRef = useRef(false);

  // OPD se "navigate('/billing', { state: { patientId, patientName } })" karke aate hain —
  // Pehle patients list mein dhoondo; offline naye patient ka ID "local_xxx" hota hai
  // aur cache refresh hone mein thodi der lag sakti hai — isliye match nahi mile to bhi
  // navState ke patientId + patientName se seedha dialog khol do.
  useEffect(() => {
    const navState = location.state as { patientId?: string; patientName?: string } | null;
    if (!navState?.patientId || navPatientConsumedRef.current) return;

    const match = patients?.find((p: any) => p.id === navState.patientId);

    // Match mila ya nahi — dono case mein dialog kholo
    setSelectedPatient(match?.id || navState.patientId);
    setPatientSearch(match?.name || navState.patientName || "");
    setOpen(true);
    navPatientConsumedRef.current = true;
  }, [location.state, patients]);


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
  }).slice().sort((a, b) => {
    const ta = a.created_at && !isNaN(new Date(a.created_at).getTime()) ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at && !isNaN(new Date(b.created_at).getTime()) ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
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

  
// 🚀 PERF: ye filter+sort pehle HAR render par poore patients array (50k+ tak)
// par dobara chalta tha — chahe patientSearch na badla ho (jaise amount/services
// type karte waqt bhi, kyunki wo bhi isi component mein re-render trigger karte
// hain). useMemo se ab ye sirf tab dobara chalega jab `patients` ya
// `patientSearch` khud badlein — baaki fields (amount, services, etc.) type
// karne par ye re-compute skip ho jaata hai. Filter/sort ka logic bilkul same hai.
const filteredPatients = useMemo(() => {
  return patients
    ?.filter((p) => {
      if (!patientSearch) return true;

      const q = patientSearch.toLowerCase();
      const searchDigits = patientSearch.replace(/\D/g, "");

      const nameMatch = p.name?.toLowerCase().includes(q);
      // 🚨 FIX: pehle "p.mobile?.includes(patientSearch.replace(/\D/g, ""))" tha —
      // jab search text mein koi digit nahi hota (jaise sirf naam type kiya),
      // replace(/\D/g,"") khaali string "" return karta tha, aur
      // "anyString".includes("") hamesha true hota hai. Isse naam-search karte
      // waqt mobile-check hamesha pass ho jaata tha aur saare patients (jinke
      // paas mobile number hai) match ho jaate the — asli naam-match wala
      // patient list mein kahin dab jaata tha, isliye "nahi milta" jaisa lagta tha.
      const mobileMatch = searchDigits.length > 0 && p.mobile?.includes(searchDigits);

      return nameMatch || mobileMatch;
    })
    .sort((a, b) => {
      // _pendingSync wale (naye offline patients) hamesha upar
      if (a._pendingSync && !b._pendingSync) return -1;
      if (!a._pendingSync && b._pendingSync) return 1;
      // created_at missing ho to naye maano (upar rakho)
      const ta = a.created_at && !isNaN(new Date(a.created_at).getTime()) ? new Date(a.created_at).getTime() : Date.now();
      const tb = b.created_at && !isNaN(new Date(b.created_at).getTime()) ? new Date(b.created_at).getTime() : Date.now();
      return tb - ta;
    });
}, [patients, patientSearch]);

  const addServiceRow = () => setServices((prev) => [...prev, { name: "", amount: "" }]);
  const removeServiceRow = (idx: number) => setServices((prev) => prev.filter((_, i) => i !== idx));
  const updateService = (idx: number, field: keyof ServiceItem, value: string) => {
    // "name" field free-text hai ab — | aur : characters allow nahi karte kyunki
    // bill ka service string isi format me save hota hai: "naam:amount|naam:amount".
    const safeValue = field === "name" ? value.replace(/[|:]/g, "") : value;
    setServices((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: safeValue } : s)));
  };

  const totalAmount = services.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
  const paidNum = parseFloat(amountPaid) || 0;
  const discountNum = parseFloat(discountAmount) || 0;
  const dueAmount = Math.max(totalAmount - discountNum - paidNum, 0);

  const computeStatus = () => {
    if (paidNum <= 0) return "Pending";
    if (paidNum >= (totalAmount - discountNum)) return "Paid";
    return "Partial";
  };

  const handleDeleteBill = useCallback(
    async (bill: any) => {
      try {
        // Delete PDF from storage only if online (offline me skip karo)
        const pdfUrl = (bill as any).invoice_pdf_url;
        if (pdfUrl) {
          const online = await isOnline();
          if (online) {
            try {
              const urlParts = pdfUrl.split("/invoices/");
              if (urlParts[1]) await supabase.storage.from("invoices").remove([urlParts[1]]);
            } catch (e) { cLog.warn('billing', 'PDF storage delete fail', e); }
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
        discount: discountNum || null,
        // 🔒 FIX: created_at yahin lock karo — offline din/din-raat use hone
        // par bill agle din sync ho to bhi Supabase apna "now()" laga ke
        // aaj ki date na de de, isliye asli banaye jaane ka time bhejte hain.
        created_at: new Date().toISOString(),
      } as any);

      toast({ title: "✅ Bill Saved", description: "Bill successfully save ho gaya" });

      // Jo bhi items type kiye the, unhe catalog mein yaad kar lo
      learnServiceItems(validServices.map((s) => ({ name: s.name, amount: parseFloat(s.amount) || 0 })));

      // ── Auto OrthoPanel: bill mein plaster ho to fracture case auto-add ──
      const plasterKeywords = ["plaster", "p.o.p", "pop", "cast", "slab", "splint", "पलस्तर"];
      const plasterService = validServices.find((s) =>
        plasterKeywords.some((kw) => s.name.toLowerCase().includes(kw))
      );
      if (plasterService && selectedPatient) {
        try {
          const { cacheGetAll } = await import("@/lib/offlineDb");
          const existingCases = await cacheGetAll("fracture_cases");
          const alreadyExists = existingCases.some(
            (c: any) => c.patient_id === selectedPatient && c.plaster_status === "Active"
          );
          if (!alreadyExists) {
            const today = new Date().toISOString().split("T")[0];
            const nextFollowup = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
              .toISOString().split("T")[0];
            await addFractureCase.mutateAsync({
              patient_id: selectedPatient,
              patient_type: "fracture",
              body_part: "Unknown",
              side: null,
              fracture_type: "Unknown",
              plaster_type: plasterService.name,
              plaster_date: today,
              followup_days: 7,
              next_followup_date: nextFollowup,
              plaster_status: "Active",
              doctor_notes: `Auto-added from billing: ${plasterService.name}`,
            } as any);
            toast({
              title: "🦴 OrthoPanel mein add ho gaya",
              description: `${plasterService.name} — patient ka active case ban gaya`,
              duration: 4000,
            });
          }
        } catch (e: any) {
          // silently fail — billing save to ho gayi
        }
      }

      // ✅ FIX: PDF auto-generate nahi karo — white screen aati thi
      // PDF sirf tab generate hogi jab user manually PDF/WhatsApp button dabaye

      // Patient naam result mein nahi aaya to patients cache se lo
      let patient = result.patients as any;
      if (!patient?.name && selectedPatient) {
        try {
          const { cacheGetAll } = await import("@/lib/offlineDb");
          const cachedPatients = await cacheGetAll("patients");
          const found = cachedPatients.find((p: any) => p.id === selectedPatient);
          if (found) patient = found;
        } catch (e) { cLog.warn('billing', 'Patient cache lookup fail', e); }
      }
      const patientName = patient?.name || "Patient";
      const mobile = patient?.mobile || "";

      // Bill save hone ke baad patient ko SMS bhejo (try-catch se wrap - crash nahi hoga)
      if (mobile && result?.id) {
        const invoiceNo = `INV-${result.id.slice(0, 8).toUpperCase()}`;
        const date = new Date().toLocaleDateString("en-IN");
        const due = Math.max(totalAmount - paidNum, 0);
        // PDF URL agar already generate hua ho to include karo
        const pdfUrl = (result as any).invoice_pdf_url || null;
        const pdfLine = pdfUrl
          ? `\n📄 बिल PDF: ${pdfUrl}`
          : "";
        const smsMsg = `नमस्ते ${patientName} जी 🙏\n\nBalaji Ortho Care Center\n\n📋 बिल नंबर: ${invoiceNo}\n📅 दिनांक: ${date}\n💰 कुल राशि: ₹${totalAmount}\n✅ जमा: ₹${paidNum}\n❗ बकाया: ₹${due}${pdfLine}\n\n🌐 हमारी वेबसाइट: https://balaji-health-hub.lovable.app\n\nधन्यवाद 🙏`;
        sendSMS(mobile, smsMsg, patientName, "bill_saved");
      }

      setSelectedPatient("");
      setServices([{ name: "", amount: "" }]);
      setAmountPaid("");
      setDiscountAmount("");
      setPaymentMode("");
      setOpen(false);
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
      safeDate(bill.created_at),
      (bill as any).invoice_pdf_url || null,
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
    setDiscountAmount(String((bill as any).discount || ""));
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
        discount: discountNum || null,
      } as any);

      const updatedBill = {
        ...editingBill,
        service: serviceStr,
        amount: newTotal,
        status,
        amount_paid: paidNum,
        payment_mode: paymentMode,
        discount: discountNum || null,
      };
      // ✅ FIX: Edit save pe bhi PDF auto-generate nahi — white screen aati thi
      // PDF sirf manual button se generate hogi

      const patient = editingBill.patients as any;
      const mobile = patient?.mobile || "";
      const patientName = patient?.name || "Patient";

      if (mobile) {
        const msg = getWhatsAppBillMessage(
          patientName,
          newTotal,
          paidNum,
          `INV-${editingBill.id.slice(0, 8).toUpperCase()}`,
          safeDate(editingBill.created_at),
          (updatedBill as any).invoice_pdf_url || null,
        );
        openWhatsAppWeb(mobile, msg);
      }

      toast({ title: "Success", description: "Bill updated & WhatsApp sent!" });
      setEditOpen(false);
      setEditingBill(null);
      setServices([{ name: "", amount: "" }]);
      setAmountPaid("");
      setDiscountAmount("");
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
        Date: safeDate(bill.created_at),
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Patient Bills");
    XLSX.writeFile(wb, `Patient_Bills_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast({ title: "Exported!", description: "Excel file download हो गई" });
  };

  const serviceNameRefs = useRef<(HTMLInputElement | null)[]>([]);
  const serviceAmountRefs = useRef<(HTMLInputElement | null)[]>([]);
  const billFormRef = useRef<HTMLFormElement | null>(null);

  const focusServiceName = (idx: number) => {
    requestAnimationFrame(() => serviceNameRefs.current[idx]?.focus());
  };

  // ── Service catalog autocomplete state ──
  const [suggestions, setSuggestions] = useState<{ name: string; rate: number }[]>([]);
  const [activeSugIdx, setActiveSugIdx] = useState(-1);
  const [sugForRow, setSugForRow] = useState<number>(-1);

  const showSuggestions = (query: string, idx: number) => {
    if (!query.trim()) { setSuggestions([]); setSugForRow(-1); return; }
    const catalog = getServiceCatalog();
    const q = query.toLowerCase();
    const matched = catalog
      .filter((c) => c.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.toLowerCase().indexOf(q) - b.name.toLowerCase().indexOf(q))
      .slice(0, 6);
    setSuggestions(matched);
    setSugForRow(idx);
    setActiveSugIdx(matched.length > 0 ? 0 : -1);
  };

  const applySuggestion = (item: { name: string; rate: number }, idx: number) => {
    updateService(idx, "name", item.name);
    updateService(idx, "amount", String(item.rate));
    setSuggestions([]); setSugForRow(-1); setActiveSugIdx(-1);
    // Amount field par focus — Enter dabakar aage badhte rahenge
    requestAnimationFrame(() => serviceAmountRefs.current[idx]?.focus());
  };

  const handleServiceNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
    // Agar suggestions khule hain to arrow/enter unhe handle kare
    if (suggestions.length > 0 && sugForRow === idx) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveSugIdx((p) => Math.min(p + 1, suggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveSugIdx((p) => Math.max(p - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const pick = activeSugIdx >= 0 ? suggestions[activeSugIdx] : suggestions[0];
        if (pick) { applySuggestion(pick, idx); return; }
      }
      if (e.key === "Escape") {
        setSuggestions([]); setSugForRow(-1); return;
      }
    }
    // No suggestions — Enter moves to amount
    if (e.key === "Enter") {
      e.preventDefault();
      setSuggestions([]); setSugForRow(-1);
      serviceAmountRefs.current[idx]?.focus();
    }
  };

  const handleServiceAmountKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const isLastRow = idx === services.length - 1;
    const current = services[idx];
    if (isLastRow) {
      if (!current.name && !current.amount) {
        billFormRef.current?.requestSubmit();
        return;
      }
      addServiceRow();
      focusServiceName(idx + 1);
    } else {
      serviceNameRefs.current[idx + 1]?.focus();
    }
  };

  const renderServiceForm = () => (
    <div className="space-y-2">
      <Label>Services</Label>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {services.map((s, idx) => (
          <div key={idx} className="flex gap-2 items-start">
            <div className="relative flex-1">
              <Input
                ref={(el) => (serviceNameRefs.current[idx] = el)}
                placeholder="Item/Service type karo..."
                className="h-9 w-full"
                value={s.name}
                autoComplete="off"
                onChange={(e) => {
                  updateService(idx, "name", e.target.value);
                  showSuggestions(e.target.value, idx);
                }}
                onKeyDown={(e) => handleServiceNameKeyDown(e, idx)}
                onBlur={() => setTimeout(() => { setSuggestions([]); setSugForRow(-1); }, 150)}
              />
              {/* Suggestion dropdown */}
              {sugForRow === idx && suggestions.length > 0 && (
                <div style={{
                  position: "absolute", top: "100%", left: 0, right: 0, zIndex: 999,
                  background: "#fff", border: "1.5px solid #1e57b0",
                  borderRadius: "8px", boxShadow: "0 4px 16px rgba(30,87,176,0.12)",
                  marginTop: "2px", overflow: "hidden",
                }}>
                  {suggestions.map((sug, si) => (
                    <div
                      key={sug.name}
                      onMouseDown={() => applySuggestion(sug, idx)}
                      style={{
                        padding: "8px 12px",
                        cursor: "pointer",
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        background: si === activeSugIdx ? "#e8f0fe" : "transparent",
                        fontSize: "13px",
                      }}
                      onMouseEnter={() => setActiveSugIdx(si)}
                    >
                      <span style={{ color: "#1a2a4a", fontWeight: si === activeSugIdx ? 600 : 400 }}>
                        {sug.name}
                      </span>
                      <span style={{ color: "#1e57b0", fontWeight: 700, fontSize: "12px" }}>
                        ₹{sug.rate}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Input
              ref={(el) => (serviceAmountRefs.current[idx] = el)}
              type="number"
              placeholder="₹"
              className="w-24 h-9"
              value={s.amount}
              onChange={(e) => updateService(idx, "amount", e.target.value)}
              onKeyDown={(e) => handleServiceAmountKeyDown(e, idx)}
            />
            {services.length > 1 && (
              <Button type="button" variant="ghost" size="icon"
                className="h-8 w-8 text-destructive mt-0.5"
                onClick={() => removeServiceRow(idx)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm"
        onClick={() => { addServiceRow(); focusServiceName(services.length); }}
        className="h-7 text-xs gap-1 w-full"
      >
        <Plus className="h-3 w-3" /> Add Service
      </Button>
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
        <div className="space-y-1">
          <Label className="text-xs">🎁 Discount (₹)</Label>
          <Input
            type="number"
            placeholder="0"
            className="h-9 border-yellow-400 focus:ring-yellow-400"
            value={discountAmount}
            onChange={(e) => setDiscountAmount(e.target.value)}
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
      <div className="space-y-6 page-enter">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div style={{
            background: "linear-gradient(135deg, #0d2351 0%, #1e57b0 55%, #0e7c4a 100%)",
            borderRadius: "18px", padding: "22px 24px",
            display: "flex", alignItems: "center", gap: "16px",
            boxShadow: "0 8px 32px rgba(13,35,81,0.28)",
            flex: 1,
          }}>
            <div style={{
              width: "54px", height: "54px", borderRadius: "14px",
              background: "rgba(255,255,255,0.18)", backdropFilter: "blur(8px)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "28px", flexShrink: 0,
            }}>💰</div>
            <div>
              <h1 style={{ fontSize: "22px", fontWeight: 800, color: "white", margin: 0, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Billing</h1>
              <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.75)", margin: 0 }}>Patient billing, payments and receipts</p>
            </div>
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
                <form ref={billFormRef} onSubmit={handleAdd} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Patient (Search by name or mobile)</Label>
                    <Input
                      placeholder="🔍 Type name or mobile number..."
                      value={patientSearch}
                      onChange={(e) => setPatientSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const top = filteredPatients?.[0];
                          if (top) {
                            setSelectedPatient(top.id);
                            focusServiceName(0);
                          }
                        }
                      }}
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
            <form ref={billFormRef} onSubmit={handleEditSave} className="space-y-4">
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

    </DashboardLayout>
  );
}
