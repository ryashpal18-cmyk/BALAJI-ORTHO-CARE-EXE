import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Building2, Phone, MapPin } from "lucide-react";

export default function SettingsPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="module-header">Settings</h1>
          <p className="text-sm text-muted-foreground">Clinic configuration and preferences</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Clinic Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Clinic Name</Label>
              <Input defaultValue="Balaji Ortho Care Center" />
            </div>
            <div className="space-y-2">
              <Label>Doctor Name</Label>
              <Input defaultValue="Dr. S. S. Rathore (DMRT | BPT)" />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <Input defaultValue="+91 8005707783" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <Input defaultValue="Opp Govt Hospital, Bay Pass Road, Khinwara, Rajasthan – 306502" />
              </div>
            </div>
            <Button>Save Changes</Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
