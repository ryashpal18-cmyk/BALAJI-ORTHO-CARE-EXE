import { useState } from "react";
import { Eye, EyeOff, User, Lock, Shield, Phone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import loginBg from "@/assets/login-bg.png";

const ADMIN_EMAIL    = "yashpal18@balajiclinic.local";
const ADMIN_PASSWORD = "Aarya@2019";
const LOCAL_USERNAME = "Yashpal18";
const LOCAL_PASSWORD = "Aarya@2019";

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername]         = useState("");
  const [password, setPassword]         = useState("");
  const [loading, setLoading]           = useState(false);
  const navigate                         = useNavigate();
  const { toast }                        = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (username !== LOCAL_USERNAME || password !== LOCAL_PASSWORD) {
      toast({
        title: "Login Failed",
        description: "Invalid username or password",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    localStorage.setItem("isLoggedIn", "true");
    localStorage.setItem("userName", username);

    try {
      await supabase.functions.invoke("create-admin-user", {
        body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      });
      await supabase.auth.signInWithPassword({
        email:    ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      });
    } catch (_) {}

    setLoading(false);
    navigate("/dashboard");
  };

  const handleAdminLogin = () => {
    setUsername(LOCAL_USERNAME);
    setPassword(LOCAL_PASSWORD);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        fontFamily: "'Segoe UI', sans-serif",
        overflow: "hidden",
      }}
    >
      {/* ── Full-screen background image (hospital corridor) ── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${loginBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center center",
          backgroundRepeat: "no-repeat",
          zIndex: 0,
        }}
      />

      {/* ── Subtle dark overlay so card is readable ── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(10, 30, 70, 0.28)",
          zIndex: 1,
        }}
      />

      {/* ── Main content row ── */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "32px 5vw",
          minHeight: "calc(100vh - 48px)",
        }}
      >
        {/* ── Left: Clinic branding panel (like original screenshot) ── */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingRight: "40px",
            maxWidth: "480px",
          }}
        >
          {/* Logo area */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "18px" }}>
            {/* Shield icon as logo placeholder */}
            <div
              style={{
                width: "72px",
                height: "72px",
                borderRadius: "16px",
                background: "linear-gradient(135deg, #1a3a6b, #1e8c4a)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
              }}
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
                stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <path d="M9 12h6M12 9v6"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#ffffff", lineHeight: 1.1, textShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>
                BALAJI
              </div>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#a8d8b0", letterSpacing: "2px" }}>
                ORTHO CARE CENTER
              </div>
            </div>
          </div>

          <div
            style={{
              fontSize: "13px",
              color: "rgba(255,255,255,0.85)",
              fontStyle: "italic",
              letterSpacing: "0.5px",
              marginBottom: "28px",
              textShadow: "0 1px 4px rgba(0,0,0,0.4)",
            }}
          >
            Advanced Bone &amp; Joint Care
          </div>

          {/* Feature badges */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {[
              { icon: "🔒", label: "Secure Access" },
              { icon: "👤", label: "User Friendly" },
              { icon: "📊", label: "Reports & Analytics" },
              { icon: "⚙️", label: "Manage Easily" },
            ].map((item) => (
              <div key={item.label} style={{
                display: "flex", alignItems: "center", gap: "10px",
                background: "rgba(255,255,255,0.12)",
                backdropFilter: "blur(8px)",
                borderRadius: "10px",
                padding: "8px 16px",
                width: "fit-content",
              }}>
                <span style={{ fontSize: "16px" }}>{item.icon}</span>
                <span style={{ fontSize: "13px", color: "white", fontWeight: 500 }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: Login Card (290px compact) ── */}
        <div
          style={{
            width: "290px",
            flexShrink: 0,
            background: "rgba(255,255,255,0.97)",
            borderRadius: "16px",
            boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
            padding: "24px 22px 18px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {/* Blue icon */}
          <div
            style={{
              width: "50px", height: "50px",
              borderRadius: "14px",
              background: "linear-gradient(135deg, #1e57b0, #1877c4)",
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: "12px",
              boxShadow: "0 6px 18px rgba(30,87,176,0.32)",
            }}
          >
            <User style={{ width: "28px", height: "28px", color: "white" }} />
          </div>

          <h2 style={{ fontSize: "17px", fontWeight: 700, color: "#1a2a4a", marginBottom: "2px", textAlign: "center" }}>
            Welcome Back!
          </h2>
          <p style={{ fontSize: "11px", color: "#5a6a84", marginBottom: "18px", textAlign: "center" }}>
            Login to your account
          </p>

          <form onSubmit={handleLogin} style={{ width: "100%", display: "flex", flexDirection: "column", gap: "9px" }}>
            {/* Username */}
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              <div style={{ position: "relative" }}>
                <User style={{
                  position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)",
                  width: "15px", height: "15px", color: "#8a9ab0",
                }} />
                <input
                  type="text"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  style={{
                    width: "100%", height: "38px", paddingLeft: "34px", paddingRight: "12px",
                    border: "1.5px solid #d5dde8", borderRadius: "9px", fontSize: "12px",
                    color: "#1a2a4a", outline: "none", background: "#f8fafc", boxSizing: "border-box",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#1e57b0")}
                  onBlur={(e)  => (e.target.style.borderColor = "#d5dde8")}
                />
              </div>
            </div>

            {/* Password */}
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              <div style={{ position: "relative" }}>
                <Lock style={{
                  position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)",
                  width: "15px", height: "15px", color: "#8a9ab0",
                }} />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{
                    width: "100%", height: "38px", paddingLeft: "34px", paddingRight: "40px",
                    border: "1.5px solid #d5dde8", borderRadius: "9px", fontSize: "13px",
                    color: "#1a2a4a", outline: "none", background: "#f8fafc", boxSizing: "border-box",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#1e57b0")}
                  onBlur={(e)  => (e.target.style.borderColor = "#d5dde8")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer", color: "#8a9ab0", padding: 0,
                  }}
                >
                  {showPassword
                    ? <EyeOff style={{ width: "16px", height: "16px" }} />
                    : <Eye    style={{ width: "16px", height: "16px" }} />}
                </button>
              </div>
            </div>

            {/* Remember me + Forgot */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11px", color: "#5a6a84" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer" }}>
                <input type="checkbox" style={{ accentColor: "#1e57b0" }} />
                Remember me
              </label>
              <span style={{ color: "#1e57b0", cursor: "pointer", fontWeight: 600 }}>Forgot Password?</span>
            </div>

            {/* Login button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%", height: "40px",
                background: "linear-gradient(135deg, #1a3a6b, #1e57b0)",
                color: "white", border: "none", borderRadius: "9px",
                fontSize: "14px", fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
                marginTop: "2px",
                boxShadow: "0 4px 14px rgba(30,87,176,0.32)",
                letterSpacing: "0.4px",
              }}
            >
              {loading ? "Signing in..." : "Login"}
            </button>

            {/* OR divider */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#aab0bc", fontSize: "11px" }}>
              <div style={{ flex: 1, height: "1px", background: "#e0e6ef" }} />
              OR
              <div style={{ flex: 1, height: "1px", background: "#e0e6ef" }} />
            </div>

            {/* Admin quick-fill */}
            <button
              type="button"
              onClick={handleAdminLogin}
              style={{
                width: "100%", height: "36px",
                background: "transparent", color: "#5a6a84",
                border: "1.5px solid #d5dde8", borderRadius: "8px",
                fontSize: "12px", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "5px",
              }}
            >
              <User style={{ width: "13px", height: "13px" }} />
              Login with Admin
            </button>
          </form>

          {/* Feature icons row */}
          <div style={{
            marginTop: "14px",
            display: "flex", justifyContent: "space-around",
            width: "100%", borderTop: "1px solid #eef0f5", paddingTop: "14px",
          }}>
            {[
              { icon: "🔒", label: "Secure\nAccess" },
              { icon: "👤", label: "User\nFriendly" },
              { icon: "📊", label: "Reports &\nAnalytics" },
              { icon: "⚙️", label: "Manage\nEasily" },
            ].map((item) => (
              <div key={item.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px" }}>
                <span style={{ fontSize: "18px" }}>{item.icon}</span>
                <span style={{ fontSize: "9px", color: "#8a9ab0", textAlign: "center", whiteSpace: "pre-line", lineHeight: 1.3 }}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div
        style={{
          position: "relative", zIndex: 2,
          height: "48px",
          background: "linear-gradient(90deg, #0d2351 0%, #1a5c2a 100%)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 28px", color: "white", fontSize: "11px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
          <Shield style={{ width: "13px", height: "13px" }} />
          <span>Your Health, Our Priority</span>
        </div>
        <span>© 2024 Balaji Ortho Care Center. All Rights Reserved.</span>
      </div>
    </div>
  );
}
