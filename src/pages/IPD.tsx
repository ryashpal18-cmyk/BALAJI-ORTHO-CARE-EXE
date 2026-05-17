import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BedDouble } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBeds } from "@/hooks/useDatabase";

const statusColor = {
  available: "bg-success/20 border-success/40 text-success",
  occupied: "bg-destructive/20 border-destructive/40 text-destructive",
  reserved: "bg-warning/20 border-warning/40 text-warning",
};
const statusBg = {
  available: "bg-success",
  occupied: "bg-destructive",
  reserved: "bg-warning",
};

export default function IPD() {
  const { data: beds, isLoading } = useBeds();

  const grouped = {
    Ward: beds?.filter(b => b.bed_type === "Ward") || [],
    "Semi-Private": beds?.filter(b => b.bed_type === "Semi-Private") || [],
    Private: beds?.filter(b => b.bed_type === "Private") || [],
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="module-header">IPD / Bed Management</h1>
            <p className="text-sm text-muted-foreground">Manage admissions and bed allocation</p>
          </div>
          <Button className="gap-2"><BedDouble className="h-4 w-4" />New Admission</Button>
        </div>

        <div className="flex gap-4 flex-wrap">
          {(["available", "occupied", "reserved"] as const).map(s => (
            <div key={s} className="flex items-center gap-2 text-sm">
              <div className={cn("h-3 w-3 rounded-full", statusBg[s])} />
              <span className="capitalize">{s}</span>
            </div>
          ))}
        </div>

        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading beds...</p>
        ) : (
          Object.entries(grouped).map(([type, typeBeds]) => (
            <Card key={type}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-heading">{type} ({typeBeds.length} beds)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {typeBeds.map(bed => (
                    <div key={bed.id} className={cn("border rounded-lg p-3 text-center cursor-pointer transition-all hover:shadow-md", statusColor[bed.status as keyof typeof statusColor] || "")}>
                      <BedDouble className="h-6 w-6 mx-auto mb-1" />
                      <p className="font-bold text-sm">{bed.bed_number}</p>
                      {(bed.patients as any)?.name && <p className="text-[10px] mt-1 truncate">{(bed.patients as any).name}</p>}
                      <Badge variant="secondary" className={cn("text-[9px] mt-1 border-0", statusColor[bed.status as keyof typeof statusColor] || "")}>
                        {bed.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </DashboardLayout>
  );
}
