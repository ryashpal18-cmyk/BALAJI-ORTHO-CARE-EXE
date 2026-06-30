import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Package, AlertTriangle, Plus, Minus, Search, History } from "lucide-react";
import { useMedicineStock, useAdjustStock, useStockMovements, MedicineStock } from "@/hooks/useInventory";

export default function Inventory() {
  const { data: medicines = [], isLoading } = useMedicineStock();
  const adjustStock = useAdjustStock();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [adjustTarget, setAdjustTarget] = useState<MedicineStock | null>(null);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [adjustMode, setAdjustMode] = useState<"in" | "out">("in");
  const [historyTarget, setHistoryTarget] = useState<MedicineStock | null>(null);

  const filtered = medicines.filter((m) =>
    m.name.toLowerCase().includes(search.toLowerCase())
  );
  const lowStockCount = medicines.filter(
    (m) => Number(m.stock_quantity) <= Number(m.low_stock_threshold)
  ).length;

  const { data: movements = [] } = useStockMovements(historyTarget?.id);

  const handleAdjustSubmit = async () => {
    if (!adjustTarget || !adjustQty || Number(adjustQty) <= 0) {
      toast({ title: "Quantity daalo", variant: "destructive" });
      return;
    }
    const change = adjustMode === "in" ? Number(adjustQty) : -Number(adjustQty);
    try {
      await adjustStock.mutateAsync({
        medicineId: adjustTarget.id,
        medicineName: adjustTarget.name,
        changeQty: change,
        reason: "manual",
        note: adjustNote,
      });
      toast({ title: `Stock ${adjustMode === "in" ? "added" : "reduced"} ✓` });
      setAdjustTarget(null);
      setAdjustQty("");
      setAdjustNote("");
    } catch (err) {
      toast({ title: "Update fail hua", variant: "destructive" });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="module-header flex items-center gap-2">
              <Package className="h-6 w-6" /> Inventory / Stock
            </h1>
            <p className="text-sm text-muted-foreground">Medicine stock track karo, low-stock alerts dekho</p>
          </div>
          {lowStockCount > 0 && (
            <Badge variant="destructive" className="gap-1 px-3 py-1.5 text-sm">
              <AlertTriangle className="h-4 w-4" /> {lowStockCount} low stock item(s)
            </Badge>
          )}
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Medicine search karo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stock List ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-left p-3 font-medium">Medicine</th>
                    <th className="text-left p-3 font-medium">Rate</th>
                    <th className="text-left p-3 font-medium">Stock</th>
                    <th className="text-left p-3 font-medium">Threshold</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-right p-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Loading...</td></tr>
                  )}
                  {!isLoading && filtered.length === 0 && (
                    <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Koi medicine nahi mili</td></tr>
                  )}
                  {filtered.map((m) => {
                    const low = Number(m.stock_quantity) <= Number(m.low_stock_threshold);
                    return (
                      <tr key={m.id} className="border-t hover:bg-muted/30">
                        <td className="p-3 font-medium">{m.name}</td>
                        <td className="p-3">₹{Number(m.rate || 0).toFixed(2)}</td>
                        <td className="p-3">{m.stock_quantity} {m.unit || "pcs"}</td>
                        <td className="p-3 text-muted-foreground">{m.low_stock_threshold}</td>
                        <td className="p-3">
                          {low ? (
                            <Badge variant="destructive">Low Stock</Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-success/15 text-success">OK</Badge>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" variant="outline" className="h-8 px-2"
                              onClick={() => { setAdjustTarget(m); setAdjustMode("in"); }}>
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 px-2"
                              onClick={() => { setAdjustTarget(m); setAdjustMode("out"); }}>
                              <Minus className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 px-2"
                              onClick={() => setHistoryTarget(m)}>
                              <History className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Adjust stock dialog */}
      <Dialog open={!!adjustTarget} onOpenChange={(o) => !o && setAdjustTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {adjustMode === "in" ? "Stock Add Karo" : "Stock Reduce Karo"} — {adjustTarget?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Quantity</Label>
              <Input type="number" min="1" value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} />
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Input value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} placeholder="e.g. New purchase / Damaged stock" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustTarget(null)}>Cancel</Button>
            <Button onClick={handleAdjustSubmit} disabled={adjustStock.isPending}>
              {adjustStock.isPending ? "Saving..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog open={!!historyTarget} onOpenChange={(o) => !o && setHistoryTarget(null)}>
        <DialogContent className="max-w-md max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Stock History — {historyTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {movements.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Koi movement record nahi mila (offline ho sakta hai)</p>
            )}
            {movements.map((mv: any) => (
              <div key={mv.id} className="flex justify-between items-center text-sm border-b pb-2">
                <div>
                  <p className={Number(mv.change_qty) >= 0 ? "text-success font-medium" : "text-destructive font-medium"}>
                    {Number(mv.change_qty) >= 0 ? "+" : ""}{mv.change_qty} ({mv.reason})
                  </p>
                  {mv.note && <p className="text-xs text-muted-foreground">{mv.note}</p>}
                </div>
                <p className="text-xs text-muted-foreground">{new Date(mv.created_at).toLocaleString("en-IN")}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
