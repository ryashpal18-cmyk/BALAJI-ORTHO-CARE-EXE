import { Package } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ServiceCatalogManager } from "@/components/ServiceCatalogManager";

export default function Products() {
  return (
    <DashboardLayout>
      <div className="space-y-6 page-enter">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Package className="h-6 w-6" /> Add Product</h1>
          <p className="mt-1 text-sm text-muted-foreground">बिलिंग के लिए अपनी सेवाओं और उनके रेट की सूची बनाएँ।</p>
        </div>
        <Card className="max-w-3xl">
          <CardHeader><CardTitle>सेवाएँ और रेट-लिस्ट</CardTitle></CardHeader>
          <CardContent><ServiceCatalogManager /></CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
