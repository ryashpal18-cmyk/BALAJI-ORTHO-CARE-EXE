import { useState, useEffect } from "react";
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
} from "lucide-react";
import {
  getStaffUsers, saveStaffUsers, getDashModules, saveDashModules,
  getAppTheme, saveAppTheme, ALL_PAGES, getCurrentRole,
  StaffUser, DashModules, AppTheme,
} from "@/lib/appConfig";
import { toast } from "@/hooks/use-toast";

// ── Tab type ──
type Tab = "clinic" | "dashboard" | "users";

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

  // ── Apply theme to CSS vars on change ──
  useEffect(() => {
    applyThemeToDom(theme);
  }, [theme]);

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
      </div>
    </DashboardLayout>
  );
}
