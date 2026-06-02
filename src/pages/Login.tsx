import { useState, useEffect } from "react";
import { Eye, EyeOff, User, Lock, Shield, Phone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getStaffUsers, STORAGE_KEYS } from "@/lib/appConfig";
import bg1 from "@/assets/dash-bg1.png";
import bg2 from "@/assets/dash-bg2.png";
import bg3 from "@/assets/dash-bg3.png";

const SLIDES = [bg1, bg2, bg3];
const ADMIN_EMAIL    = "yashpal18@balajiclinic.local";
const ADMIN_PASSWORD = "Aarya@2019";
const LOCAL_USERNAME = "Yashpal18";
const LOCAL_PASSWORD = "Aarya@2019";

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername]         = useState("");
  const [password, setPassword]         = useState("");
  const [loading, setLoading]           = useState(false);
  const [bgIndex, setBgIndex]           = useState(0);
  const [fade, setFade]                 = useState(true);
  const navigate                         = useNavigate();
  const { toast }                        = useToast();

  // Background slideshow
  useEffect(() => {
    const timer = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setBgIndex((i) => (i + 1) % SLIDES.length);
        setFade(true);
      }, 600);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // 1. Admin credentials
    if (username === LOCAL_USERNAME && password === LOCAL_PASSWORD) {
      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem("userName", username);
      localStorage.setItem(STORAGE_KEYS.USER_ROLE, "admin");
      localStorage.removeItem(STORAGE_KEYS.USER_PERMS);
      try {
        await supabase.functions.invoke("create-admin-user", {
          body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
        });
        await supabase.auth.signInWithPassword({
          email: ADMIN_EMAIL, password: ADMIN_PASSWORD,
        });
      } catch (_) {}
      setLoading(false);
      navigate("/dashboard");
      return;
    }

    // 2. Staff credentials
    const staffUsers = getStaffUsers();
    const staffUser  = staffUsers.find(
      (u) => u.username.toLowerCase() === username.toLowerCase() && u.password === password
    );
    if (staffUser) {
      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem("userName", staffUser.displayName);
      localStorage.setItem(STORAGE_KEYS.USER_ROLE, "staff");
      localStorage.setItem(STORAGE_KEYS.USER_PERMS, JSON.stringify(staffUser.allowedPages));
      setLoading(false);
      const firstPage = staffUser.allowedPages.includes("/dashboard")
        ? "/dashboard"
        : staffUser.allowedPages[0] || "/dashboard";
      navigate(firstPage);
      return;
    }

    // 3. Wrong credentials
    toast({ title: "Login Failed", description: "Username ya password galat hai", variant: "destructive" });
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: "100vh", width: "100%",
      display: "flex", flexDirection: "column",
      position: "relative", fontFamily: "'Segoe UI', sans-serif",
      overflow: "hidden",
    }}>
      {/* Slideshow background */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `url(${SLIDES[bgIndex]})`,
        backgroundSize: "cover", backgroundPosition: "center center",
        backgroundRepeat: "no-repeat", zIndex: 0,
        transition: "opacity 0.6s ease-in-out",
        opacity: fade ? 1 : 0,
      }} />

      {/* Dark overlay */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 1,
        background: "linear-gradient(135deg, rgba(10,25,60,0.55) 0%, rgba(0,0,0,0.35) 100%)",
      }} />

      {/* Slide dots */}
      <div style={{
        position: "absolute", bottom: "60px", left: "50%",
        transform: "translateX(-50%)", zIndex: 3,
        display: "flex", gap: "8px",
      }}>
        {SLIDES.map((_, i) => (
          <div key={i} onClick={() => { setFade(false); setTimeout(() => { setBgIndex(i); setFade(true); }, 300); }}
            style={{
              width: i === bgIndex ? "22px" : "8px", height: "8px",
              borderRadius: "4px", cursor: "pointer",
              background: i === bgIndex ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.4)",
              transition: "all 0.3s ease",
            }}
          />
        ))}
      </div>

      {/* Main content */}
      <div style={{
        position: "relative", zIndex: 2, flex: 1,
        display: "flex", alignItems: "center", justifyContent: "flex-end",
        padding: "32px 5vw", minHeight: "calc(100vh - 48px)",
      }}>
        {/* Login Card */}
        <div style={{
          width: "340px",
          background: "rgba(255,255,255,0.97)",
          borderRadius: "18px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
          padding: "32px 28px 24px",
          display: "flex", flexDirection: "column", alignItems: "center",
        }}>

          {/* Logo icon */}
          <div style={{
            width: "58px", height: "58px", borderRadius: "16px",
            background: "linear-gradient(135deg, #1e57b0, #1877c4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: "12px", boxShadow: "0 6px 18px rgba(30,87,176,0.32)",
          }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none"
              stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6 6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/>
              <path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/>
              <circle cx="20" cy="10" r="2"/>
            </svg>
          </div>

          <h2 style={{ fontSize: "19px", fontWeight: 700, color: "#1a2a4a", marginBottom: "3px", textAlign: "center" }}>
            Balaji Ortho Care
          </h2>
          <p style={{ fontSize: "12px", color: "#5a6a84", marginBottom: "1px", textAlign: "center" }}>
            Dr. S. S. Rathore (DMRT | BPT)
          </p>
          <p style={{ fontSize: "11px", color: "#8a9ab0", marginBottom: "22px", textAlign: "center" }}>
            Khinwara, Rajasthan – 306502
          </p>

          <form onSubmit={handleLogin} style={{ width: "100%", display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* Username */}
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#2a3a5a" }}>Username</label>
              <div style={{ position: "relative" }}>
                <User style={{
                  position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)",
                  width: "15px", height: "15px", color: "#8a9ab0",
                }} />
                <input
                  type="text" placeholder="Enter username"
                  value={username} onChange={(e) => setUsername(e.target.value)} required
                  style={{
                    width: "100%", height: "42px", paddingLeft: "34px", paddingRight: "12px",
                    border: "1.5px solid #d5dde8", borderRadius: "9px", fontSize: "13px",
                    color: "#1a2a4a", outline: "none", background: "#f8fafc", boxSizing: "border-box",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#1e57b0")}
                  onBlur={(e)  => (e.target.style.borderColor = "#d5dde8")}
                />
              </div>
            </div>

            {/* Password */}
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#2a3a5a" }}>Password</label>
              <div style={{ position: "relative" }}>
                <Lock style={{
                  position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)",
                  width: "15px", height: "15px", color: "#8a9ab0",
                }} />
                <input
                  type={showPassword ? "text" : "password"} placeholder="Enter password"
                  value={password} onChange={(e) => setPassword(e.target.value)} required
                  style={{
                    width: "100%", height: "42px", paddingLeft: "34px", paddingRight: "40px",
                    border: "1.5px solid #d5dde8", borderRadius: "9px", fontSize: "13px",
                    color: "#1a2a4a", outline: "none", background: "#f8fafc", boxSizing: "border-box",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#1e57b0")}
                  onBlur={(e)  => (e.target.style.borderColor = "#d5dde8")}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer", color: "#8a9ab0", padding: 0,
                  }}>
                  {showPassword
                    ? <EyeOff style={{ width: "16px", height: "16px" }} />
                    : <Eye    style={{ width: "16px", height: "16px" }} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} style={{
              width: "100%", height: "44px",
              background: loading
                ? "#6b8ab0"
                : "linear-gradient(135deg, #1a3a6b, #1e57b0)",
              color: "white", border: "none", borderRadius: "9px",
              fontSize: "14px", fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              marginTop: "4px",
              boxShadow: "0 4px 14px rgba(30,87,176,0.32)",
              letterSpacing: "0.4px",
              transition: "opacity 0.2s",
            }}>
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div style={{ marginTop: "16px", display: "flex", alignItems: "center", gap: "5px", color: "#8a9ab0", fontSize: "11px" }}>
            <Phone style={{ width: "12px", height: "12px" }} />
            Contact: +91 8005707783
          </div>
        </div>
      </div>

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
