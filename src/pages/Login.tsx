import { queryClient } from "@/lib/queryClient";
import { migrateLegacyIndexedDbIfNeeded } from "@/lib/offlineDb";
import { startAutoSync } from "@/lib/offlineSync";
import { startAutoBackupScheduler } from "@/lib/backup";
import { useState, useEffect } from "react";
import { Eye, EyeOff, User, Lock, Shield, Phone, LogIn } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import logoImg from "@/assets/logo.png";
import bg1 from "@/assets/dash-bg1.png";
import bg2 from "@/assets/dash-bg2.png";
import bg3 from "@/assets/dash-bg3.png";
import { STORAGE_KEYS } from "@/lib/appConfig";

const BG_IMAGES = [bg1, bg2, bg3];


export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [bgIdx, setBgIdx]   = useState(0);
  const [bgFade, setBgFade] = useState(true);
  const navigate  = useNavigate();
  const { toast } = useToast();

  // Slideshow — every 5 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setBgFade(false);
      setTimeout(() => {
        setBgIdx(i => (i + 1) % BG_IMAGES.length);
        setBgFade(true);
      }, 400);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    queryClient.clear();
    const bridge = (window as any).electron;
    const clearLogin = () => {
      [STORAGE_KEYS.IS_LOGGED_IN, STORAGE_KEYS.USER_NAME, STORAGE_KEYS.USER_ROLE, STORAGE_KEYS.USER_PERMS]
        .forEach(key => localStorage.removeItem(key));
    };
    try {
      clearLogin();
      await bridge?.logout?.();
      await supabase.auth.signOut();
      const email = username.includes("@") ? username.trim().toLowerCase() : `${username.trim().toLowerCase()}@staff.balajiclinic.local`;
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.session) throw error || new Error("Session missing");
      const { data: profile, error: profileError } = await supabase.functions.invoke("session-access");
      if (profileError || !profile || !["admin", "staff"].includes(profile.role) || !Array.isArray(profile.pages)) {
        throw profileError || new Error("Account access missing; administrator se sampark karein");
      }
      if (bridge) {
        if (!bridge.establishSession) throw new Error("Desktop app update required");
        const verified = await bridge.establishSession(data.session.access_token);
        if (!verified?.success) throw new Error("Desktop session verification failed");
      }
      if (profile.role === "admin") await migrateLegacyIndexedDbIfNeeded();
      localStorage.setItem(STORAGE_KEYS.IS_LOGGED_IN, "true");
      localStorage.setItem(STORAGE_KEYS.USER_NAME, profile.displayName || username.trim());
      localStorage.setItem(STORAGE_KEYS.USER_ROLE, profile.role);
      localStorage.setItem(STORAGE_KEYS.USER_PERMS, JSON.stringify(profile.pages));
      startAutoSync();
      if (profile.role === "admin") startAutoBackupScheduler();
      setPassword("");
      navigate(profile.role === "admin" ? "/dashboard" : profile.pages[0] || "/dashboard");
    } catch (error: any) {
      clearLogin();
      await bridge?.logout?.().catch(() => {});
      await supabase.auth.signOut().catch(() => {});
      toast({ title: "Login failed", description: error?.message || "Login ke liye internet aur valid account zaroori hai", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", width: "100%",
      display: "flex", flexDirection: "column",
      position: "relative", fontFamily: "'Segoe UI', sans-serif",
      overflow: "hidden",
    }}>

      {/* ── Slideshow Background ── */}
      {BG_IMAGES.map((src, i) => (
        <div key={i} style={{
          position: "absolute", inset: 0,
          backgroundImage: `url(${src})`,
          backgroundSize: "cover", backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          zIndex: 0,
          opacity: i === bgIdx ? (bgFade ? 1 : 0) : 0,
          transition: "opacity 0.6s ease-in-out",
        }} />
      ))}

      {/* Light overlay so text stays readable */}
      <div style={{
        position: "absolute", inset: 0,
        background: "rgba(10, 30, 70, 0.30)",
        zIndex: 1,
      }} />

      {/* ── Main layout ── */}
      <div style={{
        position: "relative", zIndex: 2, flex: 1,
        display: "flex", alignItems: "center",
        minHeight: "calc(100vh - 48px)",
      }}>

        {/* LEFT: Logo only */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: "40px 20px 40px 40px",
        }}>
          <img
            src={logoImg}
            alt="Balaji Ortho Care Logo"
            style={{
              width: "min(420px, 38vw)", height: "auto",
              filter: "drop-shadow(0 8px 36px rgba(0,0,0,0.45))",
              userSelect: "none",
            }}
          />
          <p style={{
            marginTop: "16px",
            fontSize: "clamp(13px,1.2vw,17px)",
            color: "rgba(255,255,255,0.90)",
            fontWeight: 500, letterSpacing: "0.5px",
            textShadow: "0 2px 10px rgba(0,0,0,0.55)",
            textAlign: "center",
          }}>
            Khinwara, Rajasthan — 306502
          </p>
          <p style={{
            fontSize: "clamp(11px,1vw,14px)",
            color: "rgba(255,255,255,0.65)",
            marginTop: "4px",
            textShadow: "0 2px 8px rgba(0,0,0,0.4)",
            textAlign: "center",
          }}>
            Dr. S. S. Rathore (DMRT | BPT)
          </p>

          {/* Slideshow dots */}
          <div style={{ display: "flex", gap: "8px", marginTop: "28px" }}>
            {BG_IMAGES.map((_, i) => (
              <button
                key={i}
                onClick={() => { setBgFade(false); setTimeout(() => { setBgIdx(i); setBgFade(true); }, 200); }}
                style={{
                  width: i === bgIdx ? "22px" : "8px",
                  height: "8px",
                  borderRadius: "4px",
                  background: i === bgIdx ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.40)",
                  border: "none", cursor: "pointer", padding: 0,
                  transition: "all 0.35s ease",
                }}
              />
            ))}
          </div>
        </div>

        {/* RIGHT: Colourful Login Card */}
        <div style={{
          width: "clamp(360px, 30vw, 440px)",
          marginRight: "5vw", flexShrink: 0,
          borderRadius: "22px",
          overflow: "hidden",
          boxShadow: "0 28px 80px rgba(0,0,0,0.40), 0 0 0 1px rgba(255,255,255,0.14)",
        }}>

          {/* Card Header */}
          <div style={{
            background: "linear-gradient(135deg, #0d2351 0%, #1e57b0 52%, #0e7c4a 100%)",
            padding: "28px 32px 22px",
            display: "flex", flexDirection: "column", alignItems: "center",
            position: "relative", overflow: "hidden",
          }}>
            <div style={{
              position: "absolute", top: "-30px", right: "-30px",
              width: "110px", height: "110px", borderRadius: "50%",
              background: "rgba(255,255,255,0.07)",
            }} />
            <div style={{
              position: "absolute", bottom: "-20px", left: "-20px",
              width: "80px", height: "80px", borderRadius: "50%",
              background: "rgba(255,255,255,0.05)",
            }} />
            <div style={{
              width: "64px", height: "64px", borderRadius: "18px",
              background: "rgba(255,255,255,0.18)",
              backdropFilter: "blur(8px)",
              border: "1.5px solid rgba(255,255,255,0.30)",
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: "12px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.20)",
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6 6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/>
                <path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/>
                <circle cx="20" cy="10" r="2"/>
              </svg>
            </div>
            <h2 style={{
              fontSize: "21px", fontWeight: 800, color: "#ffffff",
              marginBottom: "2px", textAlign: "center",
              textShadow: "0 2px 8px rgba(0,0,0,0.25)",
            }}>
              Balaji Ortho Care
            </h2>
            <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.80)", textAlign: "center" }}>
              Dr. S. S. Rathore (DMRT | BPT) · Khinwara
            </p>
          </div>

          {/* Card Body */}
          <div style={{ background: "rgba(255,255,255,0.97)", padding: "24px 32px 28px" }}>

            <p style={{ fontSize: "12px", color: "#5a6a84", marginBottom: "16px" }}>
              Admin: apna registered email bharein. Staff: username ya email bharein. Login ke liye internet zaroori hai.
            </p>

            <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {/* Username */}
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "#2a3a5a" }}>Email / Staff username</label>
                <div style={{ position: "relative" }}>
                  <User style={{
                    position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)",
                    width: "15px", height: "15px", color: "#8a9ab0",
                  }} />
                  <input type="text" placeholder="Email or staff username" autoComplete="username"
                    value={username}
                    onChange={e => { setUsername(e.target.value); }}
                    required
                    style={{
                      width: "100%", height: "44px", paddingLeft: "36px", paddingRight: "14px",
                      border: "1.5px solid #d5dde8", borderRadius: "10px",
                      fontSize: "14px", color: "#1a2a4a", outline: "none",
                      background: "#f8fafc", boxSizing: "border-box",
                    }}
                    onFocus={e => (e.target.style.borderColor = "#1e57b0")}
                    onBlur={e  => (e.target.style.borderColor = "#d5dde8")}
                  />
                </div>
              </div>

              {/* Password */}
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "#2a3a5a" }}>Password</label>
                <div style={{ position: "relative" }}>
                  <Lock style={{
                    position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)",
                    width: "15px", height: "15px", color: "#8a9ab0",
                  }} />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter password" autoComplete="current-password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); }}
                    required
                    style={{
                      width: "100%", height: "44px", paddingLeft: "36px", paddingRight: "42px",
                      border: "1.5px solid #d5dde8", borderRadius: "10px",
                      fontSize: "14px", color: "#1a2a4a", outline: "none",
                      background: "#f8fafc", boxSizing: "border-box",
                    }}
                    onFocus={e => (e.target.style.borderColor = "#1e57b0")}
                    onBlur={e  => (e.target.style.borderColor = "#d5dde8")}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: "absolute", right: "11px", top: "50%", transform: "translateY(-50%)",
                      background: "none", border: "none", cursor: "pointer", color: "#8a9ab0", padding: 0,
                    }}>
                    {showPassword
                      ? <EyeOff style={{ width: "16px", height: "16px" }} />
                      : <Eye    style={{ width: "16px", height: "16px" }} />}
                  </button>
                </div>
              </div>

              {/* Sign In button */}
              <button type="submit" disabled={loading}
                style={{
                  width: "100%", height: "48px",
                  background: loading
                    ? "#a0b0c8"
                    : "linear-gradient(135deg, #0d2351 0%, #1e57b0 55%, #0e7c4a 100%)",
                  color: "white", border: "none", borderRadius: "11px",
                  fontSize: "15px", fontWeight: 700,
                  cursor: loading ? "not-allowed" : "pointer",
                  marginTop: "4px",
                  boxShadow: loading ? "none" : "0 6px 20px rgba(30,87,176,0.38)",
                  letterSpacing: "0.5px",
                  display: "flex", alignItems: "center",
                  justifyContent: "center", gap: "8px",
                }}>
                {loading ? (
                  <>
                    <span style={{
                      width: "16px", height: "16px",
                      border: "2.5px solid rgba(255,255,255,0.35)",
                      borderTopColor: "#fff", borderRadius: "50%",
                      display: "inline-block",
                      animation: "spin 0.7s linear infinite",
                    }} />
                    Signing in...
                  </>
                ) : (
                  <>
                    <LogIn style={{ width: "17px", height: "17px" }} />
                    Sign In
                  </>
                )}
              </button>
            </form>

            <div style={{
              marginTop: "18px", display: "flex", alignItems: "center",
              justifyContent: "center", gap: "5px", color: "#8a9ab0", fontSize: "11px",
            }}>
              <Phone style={{ width: "12px", height: "12px" }} />
              Contact: +91 8005707783
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Footer */}
      <div style={{
        position: "relative", zIndex: 2, height: "48px",
        background: "linear-gradient(90deg, #0d2351 0%, #1a5c2a 100%)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 28px", color: "white", fontSize: "11px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
          <Shield style={{ width: "13px", height: "13px" }} />
          <span>Your Health, Our Priority</span>
        </div>
        <span>© 2024 Balaji Ortho Care Center. All Rights Reserved.</span>
      </div>
    </div>
  );
}
