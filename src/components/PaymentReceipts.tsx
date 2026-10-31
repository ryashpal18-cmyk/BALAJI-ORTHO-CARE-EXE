import { RecordSyncState } from './RecordSyncState';
import { useState } from "react";
import { paymentHistory, type Receipt } from "@/lib/paymentLedger";
import { invoiceNumber, displayBillNumber } from "@/lib/invoiceNumber";
import { escapeHtml, writeReportDocument } from "@/lib/safeReportHtml";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

export function printPaymentReceipt(bill: any, receipt: Receipt) {
  const win = window.open("", "_blank");
  if (!win) { toast({ title: "रसीद खोलने के लिए popup की अनुमति दें" }); return; }
  const e = escapeHtml;
  writeReportDocument(win, `<!doctype html><html lang="hi"><head><meta charset="utf-8"><title>Payment Receipt</title>
    <style>body{font:16px Arial,sans-serif;max-width:680px;margin:30px auto;padding:20px}h1{font-size:22px}p{line-height:1.7}@media print{button{display:none}}</style></head><body>
    <h1>Balaji Digital X-Ray &amp; Ortho Care Center</h1><h2>भुगतान रसीद</h2>
    <p>रसीद: ${e(receipt.id)}<br>बिल: ${e(displayBillNumber(bill))}<br>मरीज: ${e(bill.patients?.name || "")}<br>
    दिनांक: ${e(new Date(receipt.paid_at).toLocaleString("en-IN"))}<br>
    इस भुगतान की राशि: ₹${e(receipt.amount)}<br>भुगतान माध्यम: ${e(receipt.payment_mode)}</p>
    ${receipt.legacy ? "<p>यह पुराने बिल की कुल जमा राशि का रिकॉर्ड है; अलग भुगतान की तारीख उपलब्ध नहीं है।</p>" : ""}
    <button>Print / Save PDF</button></body></html>`);
}

export function PaymentReceipts({ bill }: { bill: any }) {
  const [open, setOpen] = useState(false);
  const rows = paymentHistory(bill);
  return <>
    <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>जमा इतिहास / रसीद</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85vh] overflow-auto">
      <RecordSyncState table="billing" row={bill}/><DialogHeader><DialogTitle>भुगतान — {displayBillNumber(bill)}</DialogTitle></DialogHeader>
      {!rows.length && <p>अभी कोई भुगतान दर्ज नहीं है।</p>}
      {rows.map(r => <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-3">
        <div><p>₹{r.amount.toLocaleString("en-IN")} · {r.payment_mode}</p>
          <p className="text-xs text-muted-foreground">{new Date(r.paid_at).toLocaleString("en-IN")}{r.legacy ? " · पुराना संयुक्त रिकॉर्ड" : ""}</p></div>
        <Button type="button" size="sm" variant="outline" onClick={() => printPaymentReceipt(bill, r)}>रसीद</Button>
      </div>)}
    </DialogContent></Dialog>
  </>;
}
