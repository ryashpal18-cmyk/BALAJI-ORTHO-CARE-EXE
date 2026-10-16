import { useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getServiceCatalog, saveServiceCatalog, serviceSearchKey, upsertServiceProduct, type ServiceCatalogItem } from "@/lib/appConfig";
import { toast } from "@/hooks/use-toast";

export function ServiceCatalogManager() {
  const [items, setItems] = useState<ServiceCatalogItem[]>(getServiceCatalog);
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const [editingId, setEditingId] = useState<string>();
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string>();
  const nameRef = useRef<HTMLInputElement>(null);
  const rateRef = useRef<HTMLInputElement>(null);
  const reset = () => { setName(""); setRate(""); setEditingId(undefined); };
  const save = () => {
    try {
      setItems(upsertServiceProduct(name, rate, editingId));
      reset(); nameRef.current?.focus();
      toast({ title: "सेवा और रेट सेव हो गए" });
    } catch (err: any) {
      toast({ title: err.message || "रेट-लिस्ट सेव नहीं हो पाई", variant: "destructive" });
    }
  };
  const remove = (id: string) => {
    try {
      const next = getServiceCatalog().filter(c => c.id !== id);
      saveServiceCatalog(next); setItems(next); setDeleteId(undefined);
      if (editingId === id) reset();
    } catch { toast({ title: "सेवा हटाई नहीं जा सकी", variant: "destructive" }); }
  };
  return <section className="space-y-4" aria-label="Product rate list">
      <p className="text-sm text-muted-foreground">X-Ray, Plaster जैसी सेवाएँ और उनके रेट पहले सेव करें। बिल बनाते समय नाम लिखकर चुनें। यह सूची इसी PC पर सेव रहेगी।</p>
      <div className="grid grid-cols-[1fr_110px] gap-3">
        <div className="space-y-1"><Label htmlFor="catalog-name">सेवा / Product का नाम</Label>
          <Input id="catalog-name" ref={nameRef} value={name} placeholder="जैसे X-Ray" onChange={e => setName(e.target.value)} onKeyDown={e => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); rateRef.current?.focus(); }
          }} /></div>
        <div className="space-y-1"><Label htmlFor="catalog-rate">रेट (₹)</Label>
          <Input id="catalog-rate" ref={rateRef} type="number" min="0" step="0.01" value={rate} placeholder="300" onChange={e => setRate(e.target.value)} onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); save(); }
          }} /></div>
      </div>
      <div className="flex gap-2"><Button type="button" onClick={save}>{editingId ? "Update Product" : "Save Product"}</Button>
        {editingId && <Button type="button" variant="outline" onClick={reset}>Cancel Edit</Button>}</div>
      <Input aria-label="Search saved products" placeholder="सेव की हुई सेवा खोजें..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }} />
      <div className="space-y-2">
        {items.filter(c => serviceSearchKey(c.name).includes(serviceSearchKey(search))).map(item => <div key={item.id} className="rounded-md border p-3">
          <div className="flex items-center gap-2"><span className="flex-1 break-words font-medium">{item.name}</span><strong>₹{item.rate.toLocaleString()}</strong>
            <Button type="button" size="icon" variant="ghost" aria-label={`Edit ${item.name}`} onClick={() => { setEditingId(item.id); setName(item.name); setRate(String(item.rate)); nameRef.current?.focus(); }}><Pencil className="h-4 w-4" /></Button>
            <Button type="button" size="icon" variant="ghost" aria-label={`Delete ${item.name}`} onClick={() => setDeleteId(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
          {deleteId === item.id && <div className="flex flex-wrap items-center gap-2 pt-2 text-sm"><span>रेट-लिस्ट से हटाएँ? पुराने बिल नहीं बदलेंगे।</span><Button type="button" size="sm" variant="destructive" onClick={() => remove(item.id)}>हटाएँ</Button><Button type="button" size="sm" variant="outline" onClick={() => setDeleteId(undefined)}>रद्द करें</Button></div>}
        </div>)}
        {!items.length && <p className="py-4 text-center text-sm text-muted-foreground">अभी कोई सेवा सेव नहीं है। ऊपर नाम और रेट भरें।</p>}
      </div>
  </section>;
}
