import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Building2 } from "lucide-react";
import { useBranchContext } from "@/lib/branchContext";

export function BranchSelector({ collapsed }: { collapsed?: boolean }) {
  const { branches, selectedBranchId, setSelectedBranchId } = useBranchContext();

  if (!branches.length) return null; // sirf ek branch hai to dropdown dikhane ki zaroorat nahi

  if (collapsed) {
    return <Building2 style={{ width: 16, height: 16, color: "rgba(255,255,255,0.55)", margin: "0 auto" }} />;
  }

  return (
    <div style={{ padding: "0 8px 6px" }}>
      <Select
        value={selectedBranchId || "all"}
        onValueChange={(v) => setSelectedBranchId(v === "all" ? null : v)}
      >
        <SelectTrigger style={{
          height: "34px", fontSize: "12px", background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)", color: "white",
        }}>
          <Building2 className="h-3.5 w-3.5 mr-1.5 opacity-60" />
          <SelectValue placeholder="All Branches" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Branches</SelectItem>
          {branches.map((b) => (
            <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
