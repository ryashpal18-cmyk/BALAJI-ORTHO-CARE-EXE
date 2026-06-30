import { useState, useEffect, useRef } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Bell, Search, X, Bone, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { isOnline } from "@/lib/offlineSync";
import { cacheGetAll } from "@/lib/offlineDb";
import { useNavigate } from "react-router-dom";
import { useFollowupsAround } from "@/hooks/useOrtho";
import { SyncStatusBadge } from "@/components/SyncStatusBadge";
import bg1 from "@/assets/dash-bg1.png";
import bg2 from "@/assets/dash-bg2.png";
import bg3 from "@/assets/dash-bg3.png";

interface DashboardLayoutProps { children: React.ReactNode; }

const todayStr = () => new Date().toISOString().slice(0, 10);
const BG_IMAGES = [bg1, bg2, bg3];

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [query, setQuery]       = useState("");
  const [results, setResults]   = useState<any[]>([]);
  const [showDrop, setShowDrop] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [bgIdx, setBgIdx]       = useState(0);
  const [fading, setFading]     = useState(false);
  const navigate = useNavigate();
  const wrapRef  = useRef<HTMLDivElement>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine); // ✅ Offline banner

  const { data: followups } = useFollowupsAround();
  const t        = todayStr();
  const todayFu  = (followups || []).filter((c: any) => c.next_followup_date === t);
  const missedFu = (followups || []).filter(
    (c: any) => c.next_followup_date && c.next_followup_date < t && c.plaster_status === "Active",
  );
  const notifCount = todayFu.length + missedFu.length;

  // ── Background auto-slide every 6 seconds ──
  useEffect(() => {
    const handleOnline  = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online",  handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online",  handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setBgIdx(prev => (prev + 1) % BG_IMAGES.length);
        setFading(false);
      }, 700);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setShowDrop(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); setShowDrop(false); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      const online = await isOnline();
      if (online) {
        try {
          const { data, error } = await supabase
            .from("patients")
            .select("id, name, mobile, age, gender")
            .ilike("name", `%${query}%`)
            .limit(8);
          if (error) throw error;
          setResults(data || []);
        } catch {
          // online query fail ho gayi (net flaky) — cache se search karo
          const all = await cacheGetAll("patients");
          const q = query.toLowerCase();
          setResults(
            (all as any[])
              .filter((p) => (p.name || "").toLowerCase().includes(q) || (p.mobile || "").includes(query))
              .slice(0, 8)
          );
        }
      } else {
        // ✅ Offline — local cache (PC pe save hua data) mein search karo
        const all = await cacheGetAll("patients");
        const q = query.toLowerCase();
        setResults(
          (all as any[])
            .filter((p) => (p.name || "").toLowerCase().includes(q) || (p.mobile || "").includes(query))
            .slice(0, 8)
        );
      }
      setShowDrop(true);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (patient: any) => {
    setQuery(""); setShowDrop(false);
    navigate(`/patient-profile/${patient.id}`);
  };

  return (
    <SidebarProvider>
      <div style={{ minHeight: "100vh", display: "flex", width: "100%", position: "relative" }}>

        {/* ── Animated Background ── */}
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 0,
            backgroundImage: `url(${BG_IMAGES[bgIdx]})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            opacity: fading ? 0 : 1,
            transition: "opacity 0.7s ease-in-out",
          }}
        />
        {/* Overlay — keeps text readable */}
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1,
            background: "rgba(235, 243, 255, 0.72)",
            backdropFilter: "blur(1px)",
          }}
        />

        {/* Sidebar */}
        <div style={{ position: "relative", zIndex: 10 }}>
          <AppSidebar />
        </div>

        {/* Right column */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative", zIndex: 5 }}>

          {/* ── TOP HEADER ── */}
          <header
            className="no-print"
            style={{
              height: "56px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "0 20px", gap: "16px",
              background: "linear-gradient(135deg, rgba(13,35,81,0.94) 0%, rgba(30,87,176,0.90) 55%, rgba(14,124,74,0.86) 100%)",
              backdropFilter: "blur(16px)",
              borderBottom: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 4px 24px rgba(13,35,81,0.28)",
              position: "sticky", top: 0, zIndex: 30,
            }}
          >
            {/* Left */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
              <SidebarTrigger style={{ color: "rgba(255,255,255,0.90)" }} />

              {/* Search */}
              <div style={{ position: "relative", width: "280px" }} ref={wrapRef} className="hidden sm:block">
                <Search style={{
                  position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)",
                  width: "15px", height: "15px", color: "rgba(255,255,255,0.60)", zIndex: 1,
                }} />
                <Input
                  placeholder="Patient name search..."
                  style={{
                    paddingLeft: "34px", paddingRight: query ? "32px" : "12px",
                    height: "36px", borderRadius: "10px",
                    border: "1.5px solid #d5dde8",
                    background: "rgba(255,255,255,0.14)",
                    fontSize: "13px",
                  }}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => results.length > 0 && setShowDrop(true)}
                />
                {query && (
                  <button
                    onClick={() => { setQuery(""); setShowDrop(false); }}
                    style={{
                      position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)",
                      background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.70)",
                    }}
                  >
                    <X style={{ width: "14px", height: "14px" }} />
                  </button>
                )}
                {showDrop && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
                    background: "white", border: "1.5px solid #e4ecfa",
                    borderRadius: "12px", boxShadow: "0 8px 24px rgba(30,87,176,0.12)",
                    zIndex: 50, overflow: "hidden",
                  }}>
                    {loading ? (
                      <div style={{ padding: "12px", textAlign: "center", fontSize: "13px", color: "#8a9ab0" }}>Searching...</div>
                    ) : results.length === 0 ? (
                      <div style={{ padding: "12px", textAlign: "center", fontSize: "13px", color: "#8a9ab0" }}>Koi patient nahi mila</div>
                    ) : (
                      <div style={{ maxHeight: "280px", overflowY: "auto" }}>
                        {results.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => handleSelect(p)}
                            style={{
                              width: "100%", textAlign: "left",
                              padding: "10px 14px",
                              borderBottom: "1px solid #f0f4fa",
                              display: "flex", alignItems: "center", justifyContent: "space-between",
                              background: "transparent", border: "none", cursor: "pointer",
                              transition: "background 0.1s",
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#f4f7fd")}
                            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                          >
                            <div>
                              <p style={{ fontSize: "13px", fontWeight: 600, color: "#1a2a4a" }}>{p.name}</p>
                              <p style={{ fontSize: "11px", color: "#8a9ab0" }}>
                                {p.mobile || "No mobile"}{p.age ? ` • ${p.age} yrs` : ""}{p.gender ? ` • ${p.gender}` : ""}
                              </p>
                            </div>
                            <span style={{ fontSize: "11px", color: "#1e57b0", fontWeight: 600 }}>View →</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {/* Slide dots */}
              <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
                {BG_IMAGES.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => { setFading(true); setTimeout(() => { setBgIdx(i); setFading(false); }, 300); }}
                    style={{
                      width: i === bgIdx ? "18px" : "7px",
                      height: "7px",
                      borderRadius: "4px",
                      background: i === bgIdx ? "#1e57b0" : "#c0cce8",
                      border: "none", cursor: "pointer", padding: 0,
                      transition: "all 0.35s ease",
                    }}
                  />
                ))}
              </div>

              {/* Offline / sync status */}
              <SyncStatusBadge />

              {/* Bell */}
              <Popover>
                <PopoverTrigger asChild>
                  <button style={{
                    position: "relative", width: "36px", height: "36px",
                    borderRadius: "10px", border: "1.5px solid #e4ecfa",
                    background: "rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer",
                  }}>
                    <Bell style={{ width: "16px", height: "16px", color: "rgba(255,255,255,0.85)" }} />
                    {notifCount > 0 && (
                      <span style={{
                        position: "absolute", top: "-4px", right: "-4px",
                        height: "18px", minWidth: "18px", padding: "0 4px",
                        borderRadius: "9px", background: "#e03e3e",
                        color: "white", fontSize: "10px", fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {notifCount}
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-0">
                  <div style={{ padding: "12px 14px", borderBottom: "1px solid #e4ecfa", display: "flex", alignItems: "center", gap: "8px" }}>
                    <Bone style={{ width: "15px", height: "15px", color: "#1e57b0" }} />
                    <span style={{ fontWeight: 700, fontSize: "13px" }}>Ortho Follow-ups</span>
                  </div>
                  <div style={{ maxHeight: "300px", overflowY: "auto" }}>
                    {notifCount === 0 ? (
                      <p style={{ padding: "16px", textAlign: "center", fontSize: "13px", color: "#8a9ab0" }}>Koi follow-up nahi</p>
                    ) : (
                      <>
                        {todayFu.length > 0 && (
                          <div style={{ padding: "8px" }}>
                            <p style={{ padding: "4px 8px", fontSize: "10px", fontWeight: 700, color: "#1e57b0", textTransform: "uppercase", letterSpacing: "1px", display: "flex", alignItems: "center", gap: "4px" }}>
                              <CalendarClock style={{ width: "11px", height: "11px" }} />
                              आज ({todayFu.length})
                            </p>
                            {todayFu.map((c: any) => (
                              <button key={c.id} onClick={() => navigate("/ortho")}
                                style={{ width: "100%", textAlign: "left", padding: "8px", borderRadius: "8px", background: "transparent", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div>
                                  <p style={{ fontSize: "13px", fontWeight: 600 }}>{c.patients?.name}</p>
                                  <p style={{ fontSize: "11px", color: "#8a9ab0" }}>{c.side} {c.body_part} · {c.plaster_type}</p>
                                </div>
                                <Badge variant="outline" style={{ fontSize: "10px" }}>{c.plaster_status}</Badge>
                              </button>
                            ))}
                          </div>
                        )}
                        {missedFu.length > 0 && (
                          <div style={{ padding: "8px", borderTop: "1px solid #f0f4fa" }}>
                            <p style={{ padding: "4px 8px", fontSize: "10px", fontWeight: 700, color: "#e03e3e", textTransform: "uppercase", letterSpacing: "1px" }}>
                              Missed ({missedFu.length})
                            </p>
                            {missedFu.map((c: any) => (
                              <button key={c.id} onClick={() => navigate("/ortho")}
                                style={{ width: "100%", textAlign: "left", padding: "8px", borderRadius: "8px", background: "transparent", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div>
                                  <p style={{ fontSize: "13px", fontWeight: 600 }}>{c.patients?.name}</p>
                                  <p style={{ fontSize: "11px", color: "#8a9ab0" }}>{c.next_followup_date} · {c.body_part}</p>
                                </div>
                                <Badge variant="destructive" style={{ fontSize: "10px" }}>Missed</Badge>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div style={{ padding: "8px", borderTop: "1px solid #f0f4fa" }}>
                    <Button size="sm" variant="ghost" style={{ width: "100%", fontSize: "12px" }} onClick={() => navigate("/ortho")}>
                      View all in Ortho Panel
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>

              {/* Avatar */}
              <div style={{
                height: "36px", width: "36px", borderRadius: "10px",
                background: "linear-gradient(135deg, #1a3a6b, #1e57b0)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 2px 8px rgba(30,87,176,0.25)",
              }}>
                <span style={{ fontSize: "12px", fontWeight: 800, color: "white" }}>DR</span>
              </div>
            </div>
          </header>

          {/* ── MAIN CONTENT ── */}
          <main style={{
            flex: 1, padding: "20px 24px",
            overflowY: "auto",
            background: "transparent",
            position: "relative",
          }}>
            {/* Colorful ambient mesh glow */}
            <div style={{
              position: "fixed",
              top: "15%", left: "20%",
              width: "500px", height: "500px",
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(30,87,176,0.06) 0%, transparent 70%)",
              pointerEvents: "none", zIndex: 0,
            }} />
            <div style={{
              position: "fixed",
              bottom: "20%", right: "15%",
              width: "400px", height: "400px",
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(14,124,74,0.05) 0%, transparent 70%)",
              pointerEvents: "none", zIndex: 0,
            }} />
            <div style={{ position: "relative", zIndex: 1 }}>
              {/* ✅ Offline Banner — internet nahi hai to clearly dikhe */}
              {isOffline && (
                <div style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "10px 18px", marginBottom: "16px",
                  background: "linear-gradient(135deg, #1e3a5f, #1e4d8c)",
                  borderRadius: "12px", border: "1.5px solid #3b82f6",
                  color: "#fff", fontSize: "13px", fontWeight: 500,
                  boxShadow: "0 2px 12px rgba(59,130,246,0.3)",
                }}>
                  <span style={{ fontSize: "18px" }}>📡</span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 700 }}>Offline Mode — </span>
                    Saara data PC mein save hai, kaam jaari hai.
                    <span style={{ color: "#93c5fd", fontSize: "12px", marginLeft: "8px" }}>
                      Internet aate hi sab kuch automatically sync ho jaayega.
                    </span>
                  </div>
                  <div style={{
                    width: "8px", height: "8px", borderRadius: "50%",
                    background: "#f87171", flexShrink: 0,
                    boxShadow: "0 0 6px #f87171",
                    animation: "pulse 2s infinite",
                  }} />
                </div>
              )}
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
