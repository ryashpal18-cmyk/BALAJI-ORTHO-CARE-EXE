import { cacheGetRow } from '@/lib/offlineDb';
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { offlineUpdate } from "@/lib/offlineQuery";
import { paymentHistory } from "@/lib/paymentLedger";
import { PaymentReceipts } from "./PaymentReceipts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

export function CollectPayment({ bill, full = false, initiallyOpen = false, onClose }: { bill: any; full?: boolean; initiallyOpen?: boolean; onClose?: () => void }) {
  const due = bill.status==="Cancelled" ? 0 : Math.max(Number(bill.amount || 0) - Number(bill.discount || 0) - Number(bill.amount_paid || 0), 0);
  const [open, setOpen] = useState(initiallyOpen);
  const [amount, setAmount] = useState(full ? String(due) : "");
  const [mode, setMode] = useState("Cash");
  const [cash,setCash]=useState("");
  const [savedBill, setSavedBill] = useState<any>(null);
  const busy = useRef(false);
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: async () => {
      if(mode==='Cash + UPI'){
        const finance=(window as any).electron?.finance;if(!finance)throw Error('नया Windows EXE चाहिए');
        const p=await finance.preview(bill.patient_id);await finance.apply({requestId:crypto.randomUUID(),patientId:bill.patient_id,billId:bill.id,action:'collect',amount:Number(amount),mode:'Cash',split:{cash:Number(cash)},fingerprint:p.fingerprint});
        return {...await cacheGetRow('billing',bill.id),patients:bill.patients};
      }
      const receiptId = crypto.randomUUID();
      const saved = await offlineUpdate("billing", bill.id, { _collectAmount: Number(amount), _receiptId: receiptId,
        _expectedPaid: Number(bill.amount_paid || 0), _auditReason: "बकाया भुगतान प्राप्त", payment_mode: mode, updated_at: new Date().toISOString() });
      if (!paymentHistory(saved).some(r => r.id === receiptId)) throw new Error("भुगतान रसीद सेव नहीं हुई");
      return { ...saved, patients: saved.patients || bill.patients };
    },
    onSuccess: value => { setSavedBill(value); setAmount(""); toast({ title: "भुगतान और रसीद डिवाइस पर सेव हैं" }); },
    onError: (error: Error) => toast({ title: error.message, variant: "destructive" }),
    onSettled: () => { busy.current = false; void qc.invalidateQueries(); },
  });
  return <>
    {!initiallyOpen && <Button type="button" size="sm" variant="outline" disabled={due <= 0} onClick={() => { setSavedBill(null); setAmount(full ? String(due) : ""); setMode("Cash"); setOpen(true); }}>{full ? "पूरा बकाया जमा" : "भुगतान जमा"}</Button>}
    <Dialog open={open} onOpenChange={value => { if (!save.isPending) { setOpen(value); if (!value) onClose?.(); } }}><DialogContent>
      <DialogHeader><DialogTitle>{bill.patients?.name || "मरीज"} — बकाया ₹{due.toLocaleString("en-IN")}</DialogTitle></DialogHeader>
      {savedBill ? <div className="space-y-3"><p>भुगतान सेव हो गया है।</p><PaymentReceipts bill={savedBill} /><Button onClick={() => { setOpen(false); onClose?.(); }}>बंद करें</Button></div> :
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (busy.current) return; busy.current = true; save.mutate(); }}>
        <div><Label htmlFor="collect-amount">आज जमा की गई राशि (₹)</Label><Input id="collect-amount" type="number" min="0.01" step="0.01" max={due} required value={amount} onChange={e => setAmount(e.target.value)} /></div>
        <div><Label htmlFor="collect-mode">भुगतान माध्यम</Label><select id="collect-mode" className="w-full rounded border bg-background p-2" value={mode} onChange={e => setMode(e.target.value)}>
          {["Cash", "UPI", "Card", "Bank Transfer", "Cash + UPI"].map(m => <option key={m}>{m}</option>)}</select></div>
        {mode==='Cash + UPI'&&<div><Label>इस भुगतान में Cash हिस्सा</Label><Input required type="number" min="0" max={Number(amount)||0} step="0.01" value={cash} onChange={e=>setCash(e.target.value)}/><p>UPI: ₹{Math.max(0,Number(amount)-Number(cash))}</p></div>}
        <p>जमा होने के बाद बकाया: ₹{Math.max(due - Number(amount || 0), 0).toLocaleString("en-IN")}</p>
        <Button type="submit" disabled={save.isPending}>{save.isPending ? "सेव हो रहा है…" : "भुगतान और रसीद सेव करें"}</Button>
      </form>}
    </DialogContent></Dialog>
  </>;
}
