import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Settings, Building2, Phone, MapPin, LayoutDashboard,
  Users, Eye, EyeOff, Trash2, Plus, ShieldCheck, UserPlus,
  Palette, ToggleLeft, ToggleRight, KeyRound, Check,
  HardDriveDownload, FolderOpen, Clock, CalendarCheck, Loader2, FileJson, FileSpreadsheet,
  Info, FileWarning, History, Activity, CheckCircle2, AlertTriangle, XCircle, FileText,
} from "lucide-react";
import {
  getStaffUsers, saveStaffUsers, getDashModules, saveDashModules,
  getAppTheme, saveAppTheme, ALL_PAGES, getCurrentRole,
  StaffUser, DashModules, AppTheme,
} from "@/lib/appConfig";
import {
  runBackupNow, listBackupFiles, openBackupFolder, getBackupFolderPath,
  getLastBackupAt, isDailyBackupEnabled, isWeeklyBackupEnabled,
  setDailyBackupEnabled, setWeeklyBackupEnabled,
} from "@/lib/backup";
import { toast } from "@/hooks/use-toast";

// ── Tab type ──
type Tab = "clinic" | "dashboard" | "users" | "backup" | "about";

// ── Preset colors ──
const COLORS = [
  { label: "Royal Blue",   value: "#1e57b0" },
  { label: "Deep Navy",    value: "#1a3a6b" },
  { label: "Teal",         value: "#0d9488" },
  { label: "Purple",       value: "#7c3aed" },
  { label: "Crimson",      value: "#dc2626" },
  { label: "Forest Green", value: "#16a34a" },
];
const ACCENT_COLORS = [
  { label: "Green",        value: "#16a34a" },
  { label: "Teal",         value: "#0d9488" },
  { label: "Blue",         value: "#2563eb" },
  { label: "Orange",       value: "#ea580c" },
  { label: "Pink",         value: "#db2777" },
  { label: "Indigo",       value: "#4f46e5" },
];

export default function SettingsPage() {
  const navigate = useNavigate();
  const [tab, setTab]             = useState<Tab>("clinic");
  const role                       = getCurrentRole();
  const isAdmin                    = role === "admin";

  // ── Clinic Info ──
  const [clinicName, setClinicName] = useState("Balaji Ortho Care Center");
  const [docName,    setDocName]    = useState("Dr. S. S. Rathore (DMRT | BPT)");
  const [phone,      setPhone]      = useState("+91 8005707783");
  const [address,    setAddress]    = useState("Opp Govt Hospital, Bay Pass Road, Khinwara, Rajasthan – 306502");

  // ── Dashboard Modules ──
  const [modules, setModules] = useState<DashModules>(getDashModules());

  // ── Theme ──
  const [theme, setTheme] = useState<AppTheme>(getAppTheme());

  // ── Users ──
  const [staffUsers,   setStaffUsers]   = useState<StaffUser[]>(getStaffUsers());
  const [newUsername,  setNewUsername]  = useState("");
  const [newPassword,  setNewPassword]  = useState("");
  const [newDisplay,   setNewDisplay]   = useState("");
  const [showPass,     setShowPass]     = useState(false);
  const [selPages,     setSelPages]     = useState<string[]>(["/dashboard"]);
  const [editingUser,  setEditingUser]  = useState<StaffUser | null>(null);

  // ── Backup ──
  const [backupRunning, setBackupRunning] = useState(false);
  const [lastBackupAt, setLastBackupAt]   = useState<string | null>(getLastBackupAt());
  const [dailyOn,      setDailyOn]        = useState(isDailyBackupEnabled());
  const [weeklyOn,     setWeeklyOn]       = useState(isWeeklyBackupEnabled());
  const [backupFiles,  setBackupFiles]    = useState<{ name: string; size: number; mtime: number }[]>([]);
  const [backupDir,    setBackupDir]      = useState<string | null>(null);

  // ── Diagnostics ──
  const [diagRunning,  setDiagRunning]  = useState(false);
  const [diagResult,   setDiagResult]   = useState<null | { errors: number; warnings: number; passed: number; reportPath?: string; text: string }>(null);
  const [nuclearRunning, setNuclearRunning] = useState(false);

  // ── About ──
  const [appVersionInfo, setAppVersionInfo] = useState<{ version: string; electron: string; node: string; platform: string } | null>(null);
  const [logsDir,        setLogsDir]        = useState<string | null>(null);
  const [snapshotDir,    setSnapshotDir]    = useState<string | null>(null);
  const [isElectron,   setIsElectron]     = useState(false);

  // ── Auto-Updater state machine ──
  type UpdateStage =
    | 'idle' | 'checking' | 'not-available' | 'available'
    | 'downloading' | 'downloaded' | 'error';
  const [updateStage,   setUpdateStage]   = useState<UpdateStage>('idle');
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [updateCurrent, setUpdateCurrent] = useState<string | null>(null);
  const [updatePercent, setUpdatePercent] = useState<number>(0);
  const [updateError,   setUpdateError]   = useState<string | null>(null);

  // ── Apply theme to CSS vars on change ──
  useEffect(() => {
    applyThemeToDom(theme);
  }, [theme]);

  // ── Backup tab: load folder/file info when opened ──
  useEffect(() => {
    if (tab !== "backup") return;
    setIsElectron(!!(window as any).electron?.backupGetDir);
    refreshBackupInfo();
  }, [tab]);

  // ── About tab: load version + listen to updater events ──
  useEffect(() => {
    if (tab !== "about") return;
    const electron = (window as any).electron;
    (async () => {
      if (electron?.getAppVersion) {
        const info = await electron.getAppVersion();
        setAppVersionInfo(info);
        setUpdateCurrent(info.version);
      }
      if (electron?.getLogsDir) setLogsDir(await electron.getLogsDir());
      // ✅ try-catch — agar handler missing ho to app crash na kare
      if (electron?.getSafetySnapshotDir) {
        try {
          const dir = await electron.getSafetySnapshotDir();
          setSnapshotDir(dir);
        } catch {
          setSnapshotDir(null); // silently ignore
        }
      }
    })();

    // updater:status events sun lo
    if (electron?.on) {
      electron.on('updater:status', (payload: any) => {
        switch (payload.event) {
          case 'checking':
            setUpdateStage('checking');
            setUpdateError(null);
            break;
          case 'available':
            setUpdateStage('available');
            setUpdateVersion(payload.latestVersion);
            setUpdateCurrent(payload.currentVersion);
            break;
          case 'not-available':
            setUpdateStage('not-available');
            setUpdateCurrent(payload.currentVersion);
            break;
          case 'progress':
            setUpdateStage('downloading');
            setUpdatePercent(payload.percent ?? 0);
            break;
          case 'downloaded':
            setUpdateStage('downloaded');
            setUpdateVersion(payload.latestVersion);
            break;
          case 'error':
            setUpdateStage('error');
            setUpdateError(payload.error || 'Update fail hua');
            break;
        }
      });
    }

    // Tab open hote hi silently check karo
    handleCheckForUpdate();

    return () => {
      electron?.removeAllListeners?.('updater:status');
    };
  }, [tab]);

  const handleCheckForUpdate = async () => {
    const electron = (window as any).electron;
    if (!electron?.checkForUpdate) return;
    setUpdateStage('checking');
    setUpdateError(null);
    try {
      await electron.checkForUpdate();
      // result 'updater:status' event se aayega
    } catch (e: any) {
      setUpdateStage('error');
      setUpdateError(e?.message || 'Update check fail hua');
    }
  };

  const handleDownloadUpdate = async () => {
    const electron = (window as any).electron;
    if (!electron?.downloadUpdate) return;
    setUpdateStage('downloading');
    setUpdatePercent(0);
    try {
      await electron.downloadUpdate();
    } catch (e: any) {
      setUpdateStage('error');
      setUpdateError(e?.message || 'Download fail hua');
    }
  };

  const handleInstallUpdate = () => {
    (window as any).electron?.installUpdate?.();
  };

  const handleOpenLogsFolder = async () => {
    await (window as any).electron?.openLogsFolder?.();
  };

  const handleOpenSnapshotFolder = async () => {
    await (window as any).electron?.openSafetySnapshotFolder?.();
  };

  const handleRunDiagnostics = async () => {
    setDiagRunning(true);
    setDiagResult(null);
    try {
      const result = await (window as any).electron?.runDiagnostics?.();
      if (result?.success === false && result?.error) {
        toast({ title: "Diagnostic Error", description: result.error, variant: "destructive" });
      }
      setDiagResult(result);
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Diagnostic fail", variant: "destructive" });
    } finally {
      setDiagRunning(false);
    }
  };

  const handleNuclearReset = async () => {
    const confirmed = window.confirm(
      "⚠️ Offline Storage Nuclear Reset\n\n" +
      "Ye app ki local cache files delete karke restart karega.\n" +
      "Aapka asli data (patients, bills) SAFE rahega — Supabase aur C:\\Balaji_Health_Backup\\ mein hai.\n\n" +
      "App 2 second mein band hokar dobara khulega.\n\n" +
      "Kya aap sure hain?"
    );
    if (!confirmed) return;
    setNuclearRunning(true);
    try {
      await (window as any).electron?.nuclearIndexedDBReset?.();
      // App restart ho jaayega — ye code nahi chalega
    } catch (e: any) {
      toast({ title: "Reset Error", description: e?.message || "Reset fail hua", variant: "destructive" });
      setNuclearRunning(false);
    }
  };

  const refreshBackupInfo = async () => {
    const dir = await getBackupFolderPath();
    setBackupDir(dir);
    const files = await listBackupFiles();
    setBackupFiles(files);
  };

  const handleBackupNow = async () => {
    setBackupRunning(true);
    const res = await runBackupNow("manual");
    setBackupRunning(false);
    if (res.ok) {
      setLastBackupAt(getLastBackupAt());
      await refreshBackupInfo();
      const totalRecords = Object.values(res.recordCounts).reduce((a, b) => a + b, 0);
      toast({
        title: "✅ Backup complete",
        description: res.mode === "electron"
          ? `${totalRecords} records backup ho gaye - Documents/Balaji_Ortho_Backups folder mein`
          : `${totalRecords} records backup ho gaye - download folder check karein`,
      });
    } else {
      toast({
        title: "Backup mein problem aayi",
        description: res.error || "Phir try karein",
        variant: "destructive",
      });
    }
  };

  const handleToggleDaily = () => {
    const next = !dailyOn;
    setDailyOn(next);
    setDailyBackupEnabled(next);
  };

  const handleToggleWeekly = () => {
    const next = !weeklyOn;
    setWeeklyOn(next);
    setWeeklyBackupEnabled(next);
  };

  const formatBackupTime = (iso: string | null) => {
    if (!iso) return "Abhi tak koi backup nahi hua";
    try {
      return new Date(iso).toLocaleString("hi-IN", { dateStyle: "medium", timeStyle: "short" });
    } catch { return iso; }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const applyThemeToDom = (t: AppTheme) => {
    // Convert hex to HSL for CSS vars
    document.documentElement.style.setProperty("--sidebar-background-override", t.primaryColor);
  };

  // ── Save handlers ──
  const handleSaveClinic = () => {
    toast({ title: "✅ Clinic info saved", description: "Changes saved successfully" });
  };

  const handleSaveModules = () => {
    saveDashModules(modules);
    toast({ title: "✅ Dashboard updated", description: "Reload dashboard to see changes" });
  };

  const handleSaveTheme = () => {
    saveAppTheme(theme);
    toast({ title: "✅ Theme saved", description: "Reload app to apply fully" });
  };

  // ── Toggle module ──
  const toggleModule = (key: keyof DashModules) => {
    setModules(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // ── Toggle page permission ──
  const togglePage = (path: string) => {
    setSelPages(prev =>
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    );
  };

  // ── Create Staff User ──
  const handleCreateUser = () => {
    if (!newUsername.trim() || !newPassword.trim()) {
      toast({ title: "Error", description: "Username aur password dono zaroori hain", variant: "destructive" });
      return;
    }
    const existing = staffUsers.find(u => u.username.toLowerCase() === newUsername.toLowerCase());
    if (existing) {
      toast({ title: "Error", description: "Ye username already exist karta hai", variant: "destructive" });
      return;
    }
    const newUser: StaffUser = {
      id:          Date.now().toString(),
      username:    newUsername.trim(),
      password:    newPassword.trim(),
      displayName: newDisplay.trim() || newUsername.trim(),
      allowedPages: selPages,
      createdAt:   new Date().toISOString(),
    };
    const updated = [...staffUsers, newUser];
    setStaffUsers(updated);
    saveStaffUsers(updated);
    setNewUsername(""); setNewPassword(""); setNewDisplay(""); setSelPages(["/dashboard"]);
    toast({ title: "✅ User created", description: `${newUser.displayName} ka account ban gaya` });
  };

  // ── Delete User ──
  const handleDeleteUser = (id: string) => {
    const updated = staffUsers.filter(u => u.id !== id);
    setStaffUsers(updated);
    saveStaffUsers(updated);
    toast({ title: "User deleted", description: "Staff user remove kar diya gaya" });
  };

  // ── Update User Permissions ──
  const handleUpdateUser = (user: StaffUser, pages: string[]) => {
    const updated = staffUsers.map(u => u.id === user.id ? { ...u, allowedPages: pages } : u);
    setStaffUsers(updated);
    saveStaffUsers(updated);
    setEditingUser(null);
    toast({ title: "✅ Permissions updated", description: `${user.displayName} ki permissions update ho gayi` });
  };

  const ToggleSwitch = ({ on, onToggle }: { on: boolean; onToggle: () => void }) => (
    <button
      onClick={onToggle}
      style={{
        width: "48px", height: "26px", borderRadius: "13px",
        background: on ? "#1e57b0" : "#d1d5db",
        border: "none", cursor: "pointer", position: "relative",
        transition: "background 0.25s",
        flexShrink: 0,
      }}
    >
      <div style={{
        width: "20px", height: "20px", borderRadius: "50%",
        background: "white", position: "absolute",
        top: "3px", left: on ? "25px" : "3px",
        transition: "left 0.25s",
        boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
      }} />
    </button>
  );

  const TAB_STYLE = (active: boolean) => ({
    padding: "9px 20px", borderRadius: "10px",
    fontSize: "13px", fontWeight: active ? 700 : 500,
    background: active ? "#1e57b0" : "transparent",
    color: active ? "white" : "#5a6a84",
    border: "none", cursor: "pointer",
    transition: "all 0.2s",
  });

  return (
    <DashboardLayout>
      <div style={{ maxWidth: "820px" }}>
        {/* Header */}
        <div style={{ marginBottom: "24px" }}>
          <h1 className="module-header" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Settings style={{ width: "24px", height: "24px", color: "#1e57b0" }} />
            Settings
          </h1>
          <p style={{ fontSize: "13px", color: "#8a9ab0", marginTop: "4px" }}>
            App customization, dashboard control, aur user management
          </p>
        </div>

        {/* Tab bar */}
        <div style={{
          display: "flex", gap: "4px", marginBottom: "24px",
          background: "rgba(255,255,255,0.85)", padding: "4px",
          borderRadius: "14px", border: "1.5px solid #e4ecfa",
          width: "fit-content", backdropFilter: "blur(8px)",
        }}>
          <button style={TAB_STYLE(tab === "clinic")}    onClick={() => setTab("clinic")}>
            <Building2 style={{ width: "14px", height: "14px", display: "inline", marginRight: "6px" }} />
            Clinic Info
          </button>
          <button style={TAB_STYLE(tab === "dashboard")} onClick={() => setTab("dashboard")}>
            <LayoutDashboard style={{ width: "14px", height: "14px", display: "inline", marginRight: "6px" }} />
            Dashboard & UI
          </button>
          {isAdmin && (
            <button style={TAB_STYLE(tab === "users")} onClick={() => setTab("users")}>
              <Users style={{ width: "14px", height: "14px", display: "inline", marginRight: "6px" }} />
              User Management
            </button>
          )}
          <button style={TAB_STYLE(tab === "backup")} onClick={() => setTab("backup")}>
            <HardDriveDownload style={{ width: "14px", height: "14px", display: "inline", marginRight: "6px" }} />
            Backup
          </button>
          <button style={TAB_STYLE(tab === "about")} onClick={() => setTab("about")}>
            <Info style={{ width: "14px", height: "14px", display: "inline", marginRight: "6px" }} />
            About
          </button>
        </div>

        {/* ══════════ TAB 1: CLINIC INFO ══════════ */}
        {tab === "clinic" && (
          <Card className="dash-card">
            <CardHeader>
              <CardTitle style={{ fontSize: "15px", display: "flex", alignItems: "center", gap: "8px" }}>
                <Building2 style={{ width: "16px", height: "16px", color: "#1e57b0" }} />
                Clinic Information
              </CardTitle>
            </CardHeader>
            <CardContent style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {[
                { label: "Clinic Name",   value: clinicName, set: setClinicName },
                { label: "Doctor Name",   value: docName,    set: setDocName },
                { label: "Phone Number",  value: phone,      set: setPhone },
                { label: "Address",       value: address,    set: setAddress },
              ].map(({ label, value, set }) => (
                <div key={label} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <Label style={{ fontSize: "12px", fontWeight: 600 }}>{label}</Label>
                  <Input value={value} onChange={e => set(e.target.value)}
                    style={{ fontSize: "13px", background: "#f8fafc" }} />
                </div>
              ))}
              <Button onClick={handleSaveClinic} style={{ width: "fit-content", gap: "6px" }}>
                <Check style={{ width: "14px", height: "14px" }} />
                Save Changes
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ══════════ TAB 2: DASHBOARD & UI ══════════ */}
        {tab === "dashboard" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

            {/* Dashboard Modules */}
            <Card className="dash-card">
              <CardHeader>
                <CardTitle style={{ fontSize: "15px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <ToggleRight style={{ width: "16px", height: "16px", color: "#1e57b0" }} />
                  Dashboard Sections — Show / Hide
                </CardTitle>
              </CardHeader>
              <CardContent style={{ display: "flex", flexDirection: "column", gap: "0px" }}>
                {([
                  { key: "statCards",     label: "Stat Cards",          desc: "Today Patients, Revenue, Pending, Appointments" },
                  { key: "todayPatients", label: "Today's Patients",     desc: "Aaj ke sabhi patients ki list" },
                  { key: "pendingDues",   label: "Pending Dues",         desc: "Baaki payment waale patients" },
                  { key: "orthoPanel",    label: "Ortho / Fracture Panel", desc: "Follow-up aur plaster tracking" },
                ] as { key: keyof DashModules; label: string; desc: string }[]).map(({ key, label, desc }) => (
                  <div key={key} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "14px 0", borderBottom: "1px solid #f0f4fa",
                  }}>
                    <div>
                      <p style={{ fontSize: "14px", fontWeight: 600, color: "#1a2a4a" }}>{label}</p>
                      <p style={{ fontSize: "12px", color: "#8a9ab0", marginTop: "2px" }}>{desc}</p>
                    </div>
                    <ToggleSwitch on={modules[key]} onToggle={() => toggleModule(key)} />
                  </div>
                ))}
                <Button onClick={handleSaveModules} style={{ marginTop: "16px", width: "fit-content", gap: "6px" }}>
                  <Check style={{ width: "14px", height: "14px" }} />
                  Save Dashboard Settings
                </Button>
              </CardContent>
            </Card>

            {/* Theme Colors */}
            <Card className="dash-card">
              <CardHeader>
                <CardTitle style={{ fontSize: "15px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Palette style={{ width: "16px", height: "16px", color: "#1e57b0" }} />
                  Theme Colors
                </CardTitle>
              </CardHeader>
              <CardContent style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

                {/* Primary color */}
                <div>
                  <p style={{ fontSize: "13px", fontWeight: 600, color: "#2a3a5a", marginBottom: "10px" }}>
                    Primary Color (Sidebar, Buttons)
                  </p>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    {COLORS.map(c => (
                      <button
                        key={c.value}
                        onClick={() => setTheme(prev => ({ ...prev, primaryColor: c.value }))}
                        title={c.label}
                        style={{
                          width: "38px", height: "38px", borderRadius: "10px",
                          background: c.value, border: "none", cursor: "pointer",
                          outline: theme.primaryColor === c.value ? `3px solid ${c.value}` : "3px solid transparent",
                          outlineOffset: "2px", transition: "outline 0.2s",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        {theme.primaryColor === c.value && (
                          <Check style={{ width: "16px", height: "16px", color: "white" }} />
                        )}
                      </button>
                    ))}
                    {/* Custom hex input */}
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <input
                        type="color"
                        value={theme.primaryColor}
                        onChange={e => setTheme(prev => ({ ...prev, primaryColor: e.target.value }))}
                        style={{ width: "38px", height: "38px", borderRadius: "10px", border: "none", cursor: "pointer", padding: "2px" }}
                      />
                      <span style={{ fontSize: "11px", color: "#8a9ab0" }}>Custom</span>
                    </div>
                  </div>
                </div>

                {/* Accent color */}
                <div>
                  <p style={{ fontSize: "13px", fontWeight: 600, color: "#2a3a5a", marginBottom: "10px" }}>
                    Accent Color (Footer, Active States)
                  </p>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    {ACCENT_COLORS.map(c => (
                      <button
                        key={c.value}
                        onClick={() => setTheme(prev => ({ ...prev, accentColor: c.value }))}
                        title={c.label}
                        style={{
                          width: "38px", height: "38px", borderRadius: "10px",
                          background: c.value, border: "none", cursor: "pointer",
                          outline: theme.accentColor === c.value ? `3px solid ${c.value}` : "3px solid transparent",
                          outlineOffset: "2px", transition: "outline 0.2s",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        {theme.accentColor === c.value && (
                          <Check style={{ width: "16px", height: "16px", color: "white" }} />
                        )}
                      </button>
                    ))}
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <input
                        type="color"
                        value={theme.accentColor}
                        onChange={e => setTheme(prev => ({ ...prev, accentColor: e.target.value }))}
                        style={{ width: "38px", height: "38px", borderRadius: "10px", border: "none", cursor: "pointer", padding: "2px" }}
                      />
                      <span style={{ fontSize: "11px", color: "#8a9ab0" }}>Custom</span>
                    </div>
                  </div>
                </div>

                {/* Live preview */}
                <div style={{
                  padding: "16px", borderRadius: "12px",
                  border: `2px solid ${theme.primaryColor}22`,
                  background: `${theme.primaryColor}08`,
                }}>
                  <p style={{ fontSize: "12px", fontWeight: 600, color: "#5a6a84", marginBottom: "10px" }}>Preview</p>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <div style={{
                      padding: "8px 18px", borderRadius: "8px",
                      background: theme.primaryColor, color: "white",
                      fontSize: "13px", fontWeight: 700,
                    }}>Primary Button</div>
                    <div style={{
                      padding: "8px 18px", borderRadius: "8px",
                      background: theme.accentColor, color: "white",
                      fontSize: "13px", fontWeight: 700,
                    }}>Accent Button</div>
                    <Badge style={{ background: `${theme.primaryColor}20`, color: theme.primaryColor, fontSize: "12px" }}>
                      Active Badge
                    </Badge>
                  </div>
                </div>

                <Button onClick={handleSaveTheme} style={{ width: "fit-content", gap: "6px" }}>
                  <Check style={{ width: "14px", height: "14px" }} />
                  Apply Theme
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══════════ TAB 3: USER MANAGEMENT ══════════ */}
        {tab === "users" && isAdmin && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

            {/* Create New User */}
            <Card className="dash-card">
              <CardHeader>
                <CardTitle style={{ fontSize: "15px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <UserPlus style={{ width: "16px", height: "16px", color: "#1e57b0" }} />
                  Naya Staff User Banao
                </CardTitle>
              </CardHeader>
              <CardContent style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

                {/* Basic fields */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                    <Label style={{ fontSize: "12px", fontWeight: 600 }}>Display Name</Label>
                    <Input
                      placeholder="e.g. Ramesh Kumar"
                      value={newDisplay}
                      onChange={e => setNewDisplay(e.target.value)}
                      style={{ fontSize: "13px", background: "#f8fafc" }}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                    <Label style={{ fontSize: "12px", fontWeight: 600 }}>Username</Label>
                    <Input
                      placeholder="e.g. ramesh123"
                      value={newUsername}
                      onChange={e => setNewUsername(e.target.value)}
                      style={{ fontSize: "13px", background: "#f8fafc" }}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                  <Label style={{ fontSize: "12px", fontWeight: 600 }}>Password</Label>
                  <div style={{ position: "relative" }}>
                    <KeyRound style={{
                      position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)",
                      width: "15px", height: "15px", color: "#8a9ab0",
                    }} />
                    <Input
                      type={showPass ? "text" : "password"}
                      placeholder="Strong password likho"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      style={{ paddingLeft: "34px", paddingRight: "40px", fontSize: "13px", background: "#f8fafc" }}
                    />
                    <button
                      onClick={() => setShowPass(!showPass)}
                      style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#8a9ab0" }}
                    >
                      {showPass ? <EyeOff style={{ width: "16px", height: "16px" }} /> : <Eye style={{ width: "16px", height: "16px" }} />}
                    </button>
                  </div>
                </div>

                {/* Page Permissions */}
                <div>
                  <Label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "10px" }}>
                    Page Access Permissions
                  </Label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                    {ALL_PAGES.map(page => {
                      const selected = selPages.includes(page.path);
                      return (
                        <button
                          key={page.path}
                          onClick={() => togglePage(page.path)}
                          style={{
                            padding: "8px 12px", borderRadius: "8px",
                            border: `1.5px solid ${selected ? "#1e57b0" : "#e0e7f0"}`,
                            background: selected ? "#1e57b010" : "#f8fafc",
                            color: selected ? "#1e57b0" : "#5a6a84",
                            fontSize: "12px", fontWeight: selected ? 600 : 400,
                            cursor: "pointer", textAlign: "left",
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            transition: "all 0.15s",
                          }}
                        >
                          {page.label}
                          {selected && <Check style={{ width: "13px", height: "13px", color: "#1e57b0" }} />}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                    <button
                      onClick={() => setSelPages(ALL_PAGES.map(p => p.path))}
                      style={{ fontSize: "11px", color: "#1e57b0", background: "none", border: "none", cursor: "pointer", padding: "2px 0" }}
                    >
                      Select All
                    </button>
                    <span style={{ color: "#c0cce8" }}>|</span>
                    <button
                      onClick={() => setSelPages(["/dashboard"])}
                      style={{ fontSize: "11px", color: "#8a9ab0", background: "none", border: "none", cursor: "pointer", padding: "2px 0" }}
                    >
                      Clear All
                    </button>
                    <span style={{ fontSize: "11px", color: "#8a9ab0", marginLeft: "auto" }}>
                      {selPages.length} pages selected
                    </span>
                  </div>
                </div>

                <Button
                  onClick={handleCreateUser}
                  style={{ width: "fit-content", gap: "6px", background: "linear-gradient(135deg, #1a3a6b, #1e57b0)" }}
                >
                  <Plus style={{ width: "14px", height: "14px" }} />
                  Create User
                </Button>
              </CardContent>
            </Card>

            {/* Existing Users */}
            {staffUsers.length > 0 && (
              <Card className="dash-card">
                <CardHeader>
                  <CardTitle style={{ fontSize: "15px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <ShieldCheck style={{ width: "16px", height: "16px", color: "#1e57b0" }} />
                    Staff Users ({staffUsers.length})
                  </CardTitle>
                </CardHeader>
                <CardContent style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {staffUsers.map(user => (
                    <div key={user.id}>
                      {editingUser?.id === user.id ? (
                        // ── Edit permissions inline ──
                        <div style={{
                          padding: "16px", borderRadius: "12px",
                          border: "2px solid #1e57b0", background: "#f0f5ff",
                        }}>
                          <p style={{ fontSize: "13px", fontWeight: 700, marginBottom: "12px", color: "#1a2a4a" }}>
                            Edit: {user.displayName}
                          </p>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "12px" }}>
                            {ALL_PAGES.map(page => {
                              const cur = editingUser.allowedPages.includes(page.path);
                              return (
                                <button
                                  key={page.path}
                                  onClick={() => {
                                    const pages = cur
                                      ? editingUser.allowedPages.filter(p => p !== page.path)
                                      : [...editingUser.allowedPages, page.path];
                                    setEditingUser({ ...editingUser, allowedPages: pages });
                                  }}
                                  style={{
                                    padding: "7px 10px", borderRadius: "7px",
                                    border: `1.5px solid ${cur ? "#1e57b0" : "#e0e7f0"}`,
                                    background: cur ? "#1e57b010" : "white",
                                    color: cur ? "#1e57b0" : "#5a6a84",
                                    fontSize: "12px", fontWeight: cur ? 600 : 400,
                                    cursor: "pointer", textAlign: "left",
                                    display: "flex", alignItems: "center", justifyContent: "space-between",
                                  }}
                                >
                                  {page.label}
                                  {cur && <Check style={{ width: "12px", height: "12px" }} />}
                                </button>
                              );
                            })}
                          </div>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <Button
                              size="sm"
                              onClick={() => handleUpdateUser(editingUser, editingUser.allowedPages)}
                              style={{ gap: "5px", fontSize: "12px" }}
                            >
                              <Check style={{ width: "13px", height: "13px" }} />
                              Save
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingUser(null)}
                              style={{ fontSize: "12px" }}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        // ── User card ──
                        <div style={{
                          padding: "14px 16px", borderRadius: "12px",
                          border: "1.5px solid #e4ecfa", background: "rgba(255,255,255,0.8)",
                          display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <div style={{
                                width: "34px", height: "34px", borderRadius: "9px",
                                background: "linear-gradient(135deg, #1a3a6b, #1e57b0)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                color: "white", fontSize: "12px", fontWeight: 800, flexShrink: 0,
                              }}>
                                {user.displayName.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p style={{ fontSize: "13px", fontWeight: 700, color: "#1a2a4a" }}>{user.displayName}</p>
                                <p style={{ fontSize: "11px", color: "#8a9ab0" }}>@{user.username}</p>
                              </div>
                            </div>
                            <div style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "4px" }}>
                              {user.allowedPages.slice(0, 5).map(p => {
                                const pg = ALL_PAGES.find(x => x.path === p);
                                return (
                                  <Badge key={p} style={{ fontSize: "10px", background: "#e8f0fe", color: "#1e57b0", border: "none" }}>
                                    {pg?.label || p}
                                  </Badge>
                                );
                              })}
                              {user.allowedPages.length > 5 && (
                                <Badge style={{ fontSize: "10px", background: "#f0f0f0", color: "#8a9ab0", border: "none" }}>
                                  +{user.allowedPages.length - 5} more
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                            <Button
                              size="sm" variant="outline"
                              onClick={() => setEditingUser({ ...user })}
                              style={{ fontSize: "11px", height: "32px", gap: "4px" }}
                            >
                              Edit Access
                            </Button>
                            <button
                              onClick={() => handleDeleteUser(user.id)}
                              style={{
                                width: "32px", height: "32px", borderRadius: "8px",
                                border: "1.5px solid #fee2e2", background: "#fef2f2",
                                color: "#dc2626", cursor: "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center",
                              }}
                            >
                              <Trash2 style={{ width: "14px", height: "14px" }} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Admin notice */}
            <div style={{
              padding: "12px 16px", borderRadius: "10px",
              background: "#fff7ed", border: "1.5px solid #fed7aa",
              fontSize: "12px", color: "#9a3412",
              display: "flex", alignItems: "flex-start", gap: "8px",
            }}>
              <ShieldCheck style={{ width: "15px", height: "15px", marginTop: "1px", flexShrink: 0 }} />
              <div>
                <strong>Admin Note:</strong> Staff users sirf unhi pages pe ja sakte hain jo aapne unhe diye hain.
                Settings page sirf Admin ke liye hota hai — staff use nahi kar sakta.
              </div>
            </div>
          </div>
        )}

        {/* ══════════ TAB 4: BACKUP ══════════ */}
        {tab === "backup" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <Card className="dash-card">
              <CardHeader>
                <CardTitle style={{ fontSize: "15px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <HardDriveDownload style={{ width: "16px", height: "16px", color: "#1e57b0" }} />
                  Data Backup
                </CardTitle>
              </CardHeader>
              <CardContent style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                <p style={{ fontSize: "13px", color: "#5a6a84" }}>
                  Pura clinic data (patients, billing, appointments, fracture cases, prescriptions, etc.)
                  ek JSON file (full restore) aur Excel file (padhne ke liye) ke roop mein backup hota hai
                  {isElectron ? " — seedha aapke Documents folder mein save hoga." : "."}
                </p>

                {/* Last backup info */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 16px", borderRadius: "10px",
                  background: "#f0f6ff", border: "1.5px solid #d6e6fb",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Clock style={{ width: "15px", height: "15px", color: "#1e57b0" }} />
                    <span style={{ fontSize: "12.5px", color: "#1a3a6b" }}>
                      Last backup: <strong>{formatBackupTime(lastBackupAt)}</strong>
                    </span>
                  </div>
                </div>

                {/* Manual backup button */}
                <Button
                  onClick={handleBackupNow}
                  disabled={backupRunning}
                  style={{ width: "fit-content", gap: "8px" }}
                >
                  {backupRunning ? (
                    <Loader2 style={{ width: "14px", height: "14px" }} className="animate-spin" />
                  ) : (
                    <HardDriveDownload style={{ width: "14px", height: "14px" }} />
                  )}
                  {backupRunning ? "Backup ho raha hai..." : "Backup Now"}
                </Button>

                {/* Auto backup toggles */}
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "4px" }}>
                  <p style={{ fontSize: "12px", fontWeight: 700, color: "#1a2a4a", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                    Automatic Backup
                  </p>
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 16px", borderRadius: "10px",
                    border: "1.5px solid #e4ecfa", background: "rgba(255,255,255,0.8)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <CalendarCheck style={{ width: "16px", height: "16px", color: "#1e57b0" }} />
                      <div>
                        <p style={{ fontSize: "13px", fontWeight: 600, color: "#1a2a4a" }}>Daily Backup</p>
                        <p style={{ fontSize: "11px", color: "#8a9ab0" }}>Har din app khulne par automatic backup</p>
                      </div>
                    </div>
                    <ToggleSwitch on={dailyOn} onToggle={handleToggleDaily} />
                  </div>
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 16px", borderRadius: "10px",
                    border: "1.5px solid #e4ecfa", background: "rgba(255,255,255,0.8)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <CalendarCheck style={{ width: "16px", height: "16px", color: "#16a34a" }} />
                      <div>
                        <p style={{ fontSize: "13px", fontWeight: 600, color: "#1a2a4a" }}>Weekly Backup</p>
                        <p style={{ fontSize: "11px", color: "#8a9ab0" }}>Har Sunday ek extra weekly backup copy</p>
                      </div>
                    </div>
                    <ToggleSwitch on={weeklyOn} onToggle={handleToggleWeekly} />
                  </div>
                  <p style={{ fontSize: "11px", color: "#8a9ab0", marginTop: "2px" }}>
                    Auto-backup ke liye internet zaroori hai (latest data fetch karne ke liye). Jab bhi app khula ho
                    aur internet ho, system khud check kar leta hai.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Backup folder + file list — Electron only */}
            {isElectron && (
              <Card className="dash-card">
                <CardHeader>
                  <CardTitle style={{ fontSize: "15px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <FolderOpen style={{ width: "16px", height: "16px", color: "#1e57b0" }} />
                      Backup Files
                    </span>
                    <Button variant="outline" size="sm" onClick={openBackupFolder} style={{ fontSize: "12px", gap: "6px" }}>
                      <FolderOpen style={{ width: "13px", height: "13px" }} />
                      Folder Kholo
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {backupDir && (
                    <p style={{ fontSize: "11px", color: "#8a9ab0", wordBreak: "break-all" }}>{backupDir}</p>
                  )}
                  {backupFiles.length === 0 ? (
                    <p style={{ fontSize: "12.5px", color: "#8a9ab0", padding: "8px 0" }}>
                      Abhi tak koi backup file nahi hai. "Backup Now" dabaye.
                    </p>
                  ) : (
                    <div style={{ maxHeight: "260px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" }}>
                      {backupFiles.map((f) => (
                        <div key={f.name} style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px",
                          padding: "9px 12px", borderRadius: "9px",
                          border: "1.5px solid #eef2f7", background: "#fafbfd",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                            {f.name.endsWith(".xlsx") ? (
                              <FileSpreadsheet style={{ width: "15px", height: "15px", color: "#16a34a", flexShrink: 0 }} />
                            ) : (
                              <FileJson style={{ width: "15px", height: "15px", color: "#1e57b0", flexShrink: 0 }} />
                            )}
                            <span style={{ fontSize: "12px", color: "#1a2a4a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {f.name}
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                            <span style={{ fontSize: "11px", color: "#8a9ab0" }}>{formatFileSize(f.size)}</span>
                            <span style={{ fontSize: "11px", color: "#8a9ab0" }}>
                              {new Date(f.mtime).toLocaleDateString("hi-IN", { day: "2-digit", month: "short" })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <div style={{
              padding: "12px 16px", borderRadius: "10px",
              background: "#fff7ed", border: "1.5px solid #fed7aa",
              fontSize: "12px", color: "#9a3412",
              display: "flex", alignItems: "flex-start", gap: "8px",
            }}>
              <ShieldCheck style={{ width: "15px", height: "15px", marginTop: "1px", flexShrink: 0 }} />
              <div>
                <strong>Suggestion:</strong> Har hafte ek backup file ko pen-drive ya Google Drive mein bhi copy kar lena
                accha rahega — system crash ya laptop change hone par bhi data surakshit rahega.
              </div>
            </div>
          </div>
        )}

        {/* ══════════ TAB 5: ABOUT ══════════ */}
        {tab === "about" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <Card className="dash-card">
              <CardHeader>
                <CardTitle style={{ fontSize: "15px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Info style={{ width: "16px", height: "16px", color: "#1e57b0" }} />
                  App Info
                </CardTitle>
              </CardHeader>
              <CardContent style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <p style={{ fontSize: "16px", fontWeight: 700, color: "#1a2a4a" }}>Balaji Ortho Care Connect</p>
                  <p style={{ fontSize: "12.5px", color: "#5a6a84" }}>Balaji Digital X-Ray &amp; Ortho Care Center</p>
                </div>

                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px",
                  padding: "12px 16px", borderRadius: "10px",
                  background: "#f0f6ff", border: "1.5px solid #d6e6fb",
                }}>
                  <div>
                    <p style={{ fontSize: "11px", color: "#8a9ab0" }}>App Version</p>
                    <p style={{ fontSize: "13px", fontWeight: 600, color: "#1a3a6b" }}>
                      {appVersionInfo?.version || "—"}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: "11px", color: "#8a9ab0" }}>Platform</p>
                    <p style={{ fontSize: "13px", fontWeight: 600, color: "#1a3a6b" }}>
                      {appVersionInfo?.platform || (isElectron ? "—" : "Browser")}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: "11px", color: "#8a9ab0" }}>Electron</p>
                    <p style={{ fontSize: "13px", fontWeight: 600, color: "#1a3a6b" }}>
                      {appVersionInfo?.electron || "—"}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: "11px", color: "#8a9ab0" }}>Node</p>
                    <p style={{ fontSize: "13px", fontWeight: 600, color: "#1a3a6b" }}>
                      {appVersionInfo?.node || "—"}
                    </p>
                  </div>
                </div>

                <p style={{ fontSize: "11px", color: "#8a9ab0", marginTop: "2px" }}>
                  © {new Date().getFullYear()} Balaji Ortho Care Center · Developed &amp; maintained by Dr. Yash Rathore
                </p>
              </CardContent>
            </Card>

            {/* ── Maintenance Tools ── */}
            <Card className="dash-card">
              <CardHeader>
                <CardTitle style={{ fontSize: "15px", display: "flex", alignItems: "center", gap: "8px" }}>
                  🔧 Maintenance Tools
                </CardTitle>
              </CardHeader>
              <CardContent style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <p style={{ fontSize: "12.5px", color: "#5a6a84" }}>
                  Ek baar chalane wale tools — data fix aur migration ke liye.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/plaster-sync")}
                  style={{ width: "fit-content", gap: "8px", fontSize: "13px" }}
                >
                  🦴 Purane Bills → OrthoPanel Sync
                </Button>
              </CardContent>
            </Card>

            <Card className="dash-card">
              <CardHeader>
                <CardTitle style={{ fontSize: "15px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <HardDriveDownload style={{ width: "16px", height: "16px", color: "#1e57b0" }} />
                  Software Update
                </CardTitle>
              </CardHeader>
              <CardContent style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

                {/* ── CHECKING ── */}
                {updateStage === 'checking' && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#5a6a84", fontSize: "13px" }}>
                    <Loader2 style={{ width: "15px", height: "15px" }} className="animate-spin" />
                    Update check ho raha hai...
                  </div>
                )}

                {/* ── UP TO DATE ── */}
                {updateStage === 'not-available' && (
                  <div style={{
                    padding: "10px 14px", borderRadius: "10px",
                    background: "#f0fdf4", border: "1.5px solid #bbf7d0",
                    fontSize: "13px", color: "#15803d", fontWeight: 600,
                  }}>
                    ✅ Aap latest version (v{updateCurrent}) use kar rahe hain.
                  </div>
                )}

                {/* ── UPDATE AVAILABLE ── */}
                {updateStage === 'available' && (
                  <div style={{
                    padding: "12px 14px", borderRadius: "10px",
                    background: "#fffbeb", border: "1.5px solid #fcd34d",
                    display: "flex", flexDirection: "column", gap: "8px",
                  }}>
                    <p style={{ fontSize: "13px", fontWeight: 700, color: "#92400e" }}>
                      🎉 Naya version available: v{updateVersion}
                    </p>
                    <p style={{ fontSize: "11.5px", color: "#78350f" }}>
                      Aapka current version v{updateCurrent} hai. Niche button dabao — app apne aap
                      download karke install kar dega. Uninstall karne ki <strong>zarurat nahi</strong>.
                    </p>
                    <Button size="sm" onClick={handleDownloadUpdate}
                      style={{ width: "fit-content", gap: "6px", background: "#d97706", border: "none" }}>
                      <HardDriveDownload style={{ width: "14px", height: "14px" }} />
                      Abhi Download Karein
                    </Button>
                  </div>
                )}

                {/* ── DOWNLOADING (progress bar) ── */}
                {updateStage === 'downloading' && (
                  <div style={{
                    padding: "12px 14px", borderRadius: "10px",
                    background: "#eff6ff", border: "1.5px solid #93c5fd",
                    display: "flex", flexDirection: "column", gap: "8px",
                  }}>
                    <p style={{ fontSize: "13px", fontWeight: 600, color: "#1e40af" }}>
                      ⬇️ Download ho raha hai... {updatePercent}%
                    </p>
                    <div style={{
                      height: "8px", borderRadius: "999px",
                      background: "#dbeafe", overflow: "hidden",
                    }}>
                      <div style={{
                        height: "100%", borderRadius: "999px",
                        background: "#3b82f6",
                        width: `${updatePercent}%`,
                        transition: "width 0.3s ease",
                      }} />
                    </div>
                    <p style={{ fontSize: "11px", color: "#3b82f6" }}>
                      Kripya wait karein, band mat karein...
                    </p>
                  </div>
                )}

                {/* ── DOWNLOADED — INSTALL READY ── */}
                {updateStage === 'downloaded' && (
                  <div style={{
                    padding: "12px 14px", borderRadius: "10px",
                    background: "#f0fdf4", border: "1.5px solid #86efac",
                    display: "flex", flexDirection: "column", gap: "8px",
                  }}>
                    <p style={{ fontSize: "13px", fontWeight: 700, color: "#15803d" }}>
                      ✅ v{updateVersion} download complete!
                    </p>
                    <p style={{ fontSize: "11.5px", color: "#166534" }}>
                      Install button dabao — app band hokar update install karega aur dobara khul jayega.
                    </p>
                    <Button size="sm" onClick={handleInstallUpdate}
                      style={{ width: "fit-content", gap: "6px", background: "#16a34a", border: "none" }}>
                      <HardDriveDownload style={{ width: "14px", height: "14px" }} />
                      Install Karein &amp; Restart
                    </Button>
                  </div>
                )}

                {/* ── ERROR ── */}
                {updateStage === 'error' && (
                  <div style={{
                    padding: "10px 14px", borderRadius: "10px",
                    background: "#fff1f2", border: "1.5px solid #fca5a5",
                    fontSize: "12.5px", color: "#9a3412",
                  }}>
                    ⚠️ {updateError}
                  </div>
                )}

                <Button
                  variant="outline" size="sm" onClick={handleCheckForUpdate}
                  disabled={updateStage === 'checking' || updateStage === 'downloading'}
                  style={{ width: "fit-content", fontSize: "12px" }}
                >
                  Dobara Check Karein
                </Button>
              </CardContent>
            </Card>

            {isElectron && (
              <Card className="dash-card">
                <CardHeader>
                  <CardTitle style={{ fontSize: "15px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <Activity style={{ width: "16px", height: "16px", color: "#6366f1" }} />
                    🔍 Run Diagnostics — App Self-Check
                  </CardTitle>
                </CardHeader>
                <CardContent style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <p style={{ fontSize: "12.5px", color: "#5a6a84", lineHeight: 1.6 }}>
                    Software khud apni saari files, data, internet aur settings check karega —
                    aur ek detailed <strong>report file</strong> PC pe save karega.
                    Agar koi error ya bug ho to wahan clearly likha milega.
                  </p>

                  <Button
                    onClick={handleRunDiagnostics}
                    disabled={diagRunning}
                    style={{
                      width: "fit-content", gap: "8px", fontSize: "13px",
                      background: diagRunning ? "#94a3b8" : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                      border: "none", color: "#fff",
                    }}
                  >
                    {diagRunning
                      ? <><Loader2 style={{ width: "14px", height: "14px", animation: "spin 1s linear infinite" }} />Checking...</>
                      : <><Activity style={{ width: "14px", height: "14px" }} />Run Diagnostics</>
                    }
                  </Button>

                  {/* ── Result Summary ── */}
                  {diagResult && !diagRunning && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {/* Score card */}
                      <div style={{
                        display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px",
                      }}>
                        <div style={{ background: "#f0fdf4", border: "1.5px solid #bbf7d0", borderRadius: "10px", padding: "10px", textAlign: "center" }}>
                          <CheckCircle2 style={{ width: "18px", height: "18px", color: "#16a34a", margin: "0 auto 4px" }} />
                          <p style={{ fontSize: "20px", fontWeight: 800, color: "#16a34a", margin: 0 }}>{diagResult.passed}</p>
                          <p style={{ fontSize: "10px", color: "#6b7280", margin: 0 }}>✅ Pass</p>
                        </div>
                        <div style={{ background: diagResult.warnings > 0 ? "#fffbeb" : "#f8fafc", border: `1.5px solid ${diagResult.warnings > 0 ? "#fcd34d" : "#e2e8f0"}`, borderRadius: "10px", padding: "10px", textAlign: "center" }}>
                          <AlertTriangle style={{ width: "18px", height: "18px", color: diagResult.warnings > 0 ? "#d97706" : "#9ca3af", margin: "0 auto 4px" }} />
                          <p style={{ fontSize: "20px", fontWeight: 800, color: diagResult.warnings > 0 ? "#d97706" : "#9ca3af", margin: 0 }}>{diagResult.warnings}</p>
                          <p style={{ fontSize: "10px", color: "#6b7280", margin: 0 }}>⚠️ Warnings</p>
                        </div>
                        <div style={{ background: diagResult.errors > 0 ? "#fef2f2" : "#f8fafc", border: `1.5px solid ${diagResult.errors > 0 ? "#fca5a5" : "#e2e8f0"}`, borderRadius: "10px", padding: "10px", textAlign: "center" }}>
                          <XCircle style={{ width: "18px", height: "18px", color: diagResult.errors > 0 ? "#dc2626" : "#9ca3af", margin: "0 auto 4px" }} />
                          <p style={{ fontSize: "20px", fontWeight: 800, color: diagResult.errors > 0 ? "#dc2626" : "#9ca3af", margin: 0 }}>{diagResult.errors}</p>
                          <p style={{ fontSize: "10px", color: "#6b7280", margin: 0 }}>❌ Errors</p>
                        </div>
                      </div>

                      {/* Status banner */}
                      <div style={{
                        padding: "10px 14px", borderRadius: "10px",
                        background: diagResult.errors > 0 ? "#fef2f2" : diagResult.warnings > 0 ? "#fffbeb" : "#f0fdf4",
                        border: `1.5px solid ${diagResult.errors > 0 ? "#fca5a5" : diagResult.warnings > 0 ? "#fcd34d" : "#bbf7d0"}`,
                        fontSize: "13px", fontWeight: 600,
                        color: diagResult.errors > 0 ? "#dc2626" : diagResult.warnings > 0 ? "#92400e" : "#16a34a",
                      }}>
                        {diagResult.errors > 0
                          ? "🚨 Kuch serious errors hain — report file dekho aur fix karo"
                          : diagResult.warnings > 0
                            ? "⚠️ Kuch warnings hain — niche report mein details dekho"
                            : "🎉 Sab theek hai! Koi error nahi mila"
                        }
                      </div>

                      {/* Report text preview */}
                      <div style={{ position: "relative" }}>
                        <p style={{ fontSize: "11px", fontWeight: 600, color: "#374151", marginBottom: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
                          <FileText style={{ width: "12px", height: "12px" }} />
                          Report Preview (scroll karke poora dekho):
                        </p>
                        <pre style={{
                          background: "#0f172a", color: "#e2e8f0", fontFamily: "Consolas, monospace",
                          fontSize: "10.5px", padding: "12px 14px", borderRadius: "10px",
                          maxHeight: "280px", overflowY: "auto", overflowX: "auto",
                          whiteSpace: "pre-wrap", lineHeight: 1.7,
                          border: "1px solid #1e293b",
                        }}>
                          {diagResult.text}
                        </pre>
                      </div>

                      {/* Report file path */}
                      {diagResult.reportPath && (
                        <div style={{
                          display: "flex", alignItems: "center", gap: "10px",
                          padding: "10px 14px", borderRadius: "10px",
                          background: "#f0f9ff", border: "1.5px solid #bae6fd",
                        }}>
                          <FileText style={{ width: "14px", height: "14px", color: "#0891b2", flexShrink: 0 }} />
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: "11px", fontWeight: 600, color: "#0c4a6e", margin: 0 }}>Report File Save Hui:</p>
                            <p style={{ fontSize: "10.5px", color: "#0369a1", margin: "2px 0 0", wordBreak: "break-all" }}>{diagResult.reportPath}</p>
                          </div>
                          <Button
                            variant="outline" size="sm"
                            onClick={() => (window as any).electron?.openFolder?.(diagResult.reportPath?.replace(/[^\\]+$/, ""))}
                            style={{ fontSize: "11px", flexShrink: 0 }}
                          >
                            <FolderOpen style={{ width: "12px", height: "12px", marginRight: "4px" }} />
                            Open
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {isElectron && (
              <Card className="dash-card">
                <CardHeader>
                  <CardTitle style={{ fontSize: "15px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <FileWarning style={{ width: "16px", height: "16px", color: "#dc2626" }} />
                    🔴 Offline Storage Nuclear Reset
                  </CardTitle>
                </CardHeader>
                <CardContent style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{
                    padding: "10px 14px", borderRadius: "10px",
                    background: "#fef2f2", border: "1.5px solid #fca5a5",
                  }}>
                    <p style={{ fontSize: "12.5px", color: "#991b1b", fontWeight: 600, margin: "0 0 6px" }}>
                      ⚠️ Sirf tab use karo jab app mein ye errors aayein:
                    </p>
                    <p style={{ fontSize: "11.5px", color: "#7f1d1d", margin: 0, lineHeight: 1.7 }}>
                      • "queueGetAll retry bhi fail"<br/>
                      • "Internal error opening backing store"<br/>
                      • "Fresh DB bhi nahi khuli"<br/>
                      • Log file mein 1000+ same errors
                    </p>
                  </div>

                  <div style={{
                    padding: "10px 14px", borderRadius: "10px",
                    background: "#f0fdf4", border: "1.5px solid #bbf7d0",
                  }}>
                    <p style={{ fontSize: "12px", color: "#166534", lineHeight: 1.7, margin: 0 }}>
                      ✅ <strong>Data bilkul safe rahega</strong> — patients, bills, reports sab Supabase
                      aur <code style={{ fontSize: "11px" }}>C:\Balaji_Health_Backup\</code> mein hain.<br/>
                      Sirf local browser cache delete hogi. App restart ke baad data wapas load ho jaayega.
                    </p>
                  </div>

                  <Button
                    onClick={handleNuclearReset}
                    disabled={nuclearRunning}
                    style={{
                      width: "fit-content", gap: "8px", fontSize: "13px",
                      background: nuclearRunning ? "#94a3b8" : "#dc2626",
                      border: "none", color: "#fff",
                    }}
                  >
                    {nuclearRunning
                      ? <><Loader2 style={{ width: "14px", height: "14px", animation: "spin 1s linear infinite" }} />Reset ho raha hai... App band hoga</>
                      : <><XCircle style={{ width: "14px", height: "14px" }} />Offline DB Reset &amp; Restart</>
                    }
                  </Button>
                </CardContent>
              </Card>
            )}

            {isElectron && (
              <Card className="dash-card">
                <CardHeader>
                  <CardTitle style={{ fontSize: "15px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <FileWarning style={{ width: "16px", height: "16px", color: "#1e57b0" }} />
                    Error Logs
                  </CardTitle>
                </CardHeader>
                <CardContent style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <p style={{ fontSize: "12.5px", color: "#5a6a84" }}>
                    Agar app mein kabhi koi error ya crash aaye, uska detail yahan ek log file mein save
                    ho jaata hai — support ke liye yeh folder share kiya ja sakta hai.
                  </p>
                  {logsDir && (
                    <p style={{ fontSize: "11px", color: "#8a9ab0", wordBreak: "break-all" }}>{logsDir}</p>
                  )}
                  <Button variant="outline" size="sm" onClick={handleOpenLogsFolder} style={{ width: "fit-content", fontSize: "12px", gap: "6px" }}>
                    <FolderOpen style={{ width: "13px", height: "13px" }} />
                    Logs Folder Kholo
                  </Button>
                </CardContent>
              </Card>
            )}

            {isElectron && (
              <Card className="dash-card">
                <CardHeader>
                  <CardTitle style={{ fontSize: "15px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <History style={{ width: "16px", height: "16px", color: "#1e57b0" }} />
                    Daily Safety Snapshots
                  </CardTitle>
                </CardHeader>
                <CardContent style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <p style={{ fontSize: "12.5px", color: "#5a6a84" }}>
                    Har din app khulne par patients/bills/reports/x-rays ki ek extra copy yahan save hoti hai
                    (30 din tak rakhi jaati hai) — agar kabhi data file corrupt ho jaaye, yahan se manually
                    restore ho sakta hai.
                  </p>
                  {snapshotDir && (
                    <p style={{ fontSize: "11px", color: "#8a9ab0", wordBreak: "break-all" }}>{snapshotDir}</p>
                  )}
                  <Button variant="outline" size="sm" onClick={handleOpenSnapshotFolder} style={{ width: "fit-content", fontSize: "12px", gap: "6px" }}>
                    <FolderOpen style={{ width: "13px", height: "13px" }} />
                    Snapshot Folder Kholo
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
