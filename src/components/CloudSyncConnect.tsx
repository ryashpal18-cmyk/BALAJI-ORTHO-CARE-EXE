import { CloudReconcile } from './CloudReconcile';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { resetCloudConnection, ensureCloudSession } from '@/lib/localSession';
import { runSync, downloadAllDataToCache } from '@/lib/offlineSync';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function CloudSyncConnect() {
  const bridge = (window as any).electron;
  const [localOwner, setLocalOwner] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Cloud connection जाँची जा रही है…');
  const refresh = async () => {
    if (!bridge?.cloudSyncStatus) return;
    const auth = await bridge.checkAuth();
    setLocalOwner(!!auth.valid && !!auth.principal?.localAdmin);
    if (!auth.valid || !auth.principal?.localAdmin) return;
    const s = await bridge.cloudSyncStatus();
    setMessage(s.error || (s.configured ? 'Cloud connection saved है। Background sync अपने आप चलेगा।' : 'पहली बार cloud account जोड़ें। Software का local login इससे अलग है।'));
  };
  useEffect(() => { void refresh().catch(() => setMessage('Cloud connection जाँच नहीं हुई।')); }, []);
  if (!localOwner) return null;
  const connect = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error || !data.session) throw new Error('Cloud email/password सही नहीं है या connection उपलब्ध नहीं है।');
      await bridge.adoptSyncSession(data.session);
      resetCloudConnection();
      if (!(await ensureCloudSession())) throw new Error('Cloud verification पूरा नहीं हुआ।');
      const result = await runSync({retrySchema:true});
      void downloadAllDataToCache().catch(() => {});
      setMessage(`${result.synced} records sync हुए; ${result.pending} pending हैं। बाकी background में retry होंगे।`);
    } catch (error: any) {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      resetCloudConnection();
      setMessage(error?.message || 'Cloud connection failed। Patient data PC पर बना रहेगा।');
    } finally { setPassword(''); setBusy(false); }
  };
  const sync = async () => {
    if (busy) return;
    setBusy(true);
    try {
      resetCloudConnection();
      const connected = await ensureCloudSession();
      if (!connected) { await refresh(); return; }
      const r = await runSync({retrySchema:true});
      setMessage(`${r.synced} records sync हुए; ${r.pending} pending हैं।`);
    } catch { setMessage('Sync अभी पूरा नहीं हुआ। Pending data सुरक्षित रखा गया है।'); }
    finally { setBusy(false); }
  };
  return <Card className="dash-card mb-6">
    <CardHeader><CardTitle>BJ BACKUP · Cloud Sync</CardTitle></CardHeader>
    <CardContent>
      <p className="mb-3 text-sm" role="status">{message}</p>
      <p className="mb-4 text-sm text-muted-foreground">BJ BACKUP से connect करें। Cloud password save नहीं होगा; connection इस PC पर सुरक्षित रखा जाएगा।</p>
      <CloudReconcile/><form onSubmit={connect} className="space-y-3">
        <Label htmlFor="cloud-sync-email">Cloud account email</Label>
        <Input id="cloud-sync-email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required disabled={busy} />
        <Label htmlFor="cloud-sync-password">Cloud account password</Label>
        <Input id="cloud-sync-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required disabled={busy} />
        <div className="flex gap-3"><Button type="submit" disabled={busy}>{busy ? 'Connecting…' : 'Connect Cloud'}</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void sync()}>Sync Now</Button></div>
      </form>
    </CardContent>
  </Card>;
}
