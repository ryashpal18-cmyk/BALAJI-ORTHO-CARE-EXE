import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck } from "lucide-react";
import {
  isPinEnabled, setPin, disablePin, getLockTimeoutMin, setLockTimeoutMin,
} from "@/lib/pinLock";

/**
 * Drop this card anywhere inside SettingsPage.tsx, e.g.:
 *   import { PinSetupCard } from "@/components/PinSetupCard";
 *   ...
 *   <PinSetupCard />
 */
export function PinSetupCard() {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(isPinEnabled());
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [timeoutMin, setTimeoutMin] = useState(getLockTimeoutMin());

  const handleToggle = (val: boolean) => {
    if (!val) {
      disablePin();
      setEnabled(false);
      toast({ title: "App lock band kar diya" });
    } else {
      setEnabled(true); // form dikhayega, save par hi actually enable hoga
    }
  };

  const handleSave = async () => {
    if (newPin.length < 4) {
      toast({ title: "PIN kam se kam 4 digit ka rakho", variant: "destructive" });
      return;
    }
    if (newPin !== confirmPin) {
      toast({ title: "PIN match nahi ho raha", variant: "destructive" });
      return;
    }
    await setPin(newPin);
    setLockTimeoutMin(timeoutMin);
    setNewPin("");
    setConfirmPin("");
    toast({ title: "App lock PIN set ho gaya ✓" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> App Lock (PIN)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>PIN lock enable karo</Label>
          <Switch checked={enabled} onCheckedChange={handleToggle} />
        </div>

        {enabled && (
          <div className="space-y-3 pt-2 border-t">
            <div>
              <Label>Naya PIN (4-6 digit)</Label>
              <Input
                type="password" inputMode="numeric" maxLength={6}
                value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div>
              <Label>PIN confirm karo</Label>
              <Input
                type="password" inputMode="numeric" maxLength={6}
                value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div>
              <Label>Auto-lock kitni der baad (minutes)</Label>
              <Input
                type="number" min={1} value={timeoutMin}
                onChange={(e) => setTimeoutMin(Number(e.target.value) || 5)}
              />
            </div>
            <Button onClick={handleSave} className="w-full">PIN Save Karo</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
