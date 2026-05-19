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
      {/* Full-screen background — backgroundSize: "cover" rakho, change mat karo */}
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

      {/* Main content — card right side pe */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          padding: "32px 5vw",
          minHeight: "calc(100vh - 48px)",
        }}
      >
        {/* ── Login Card (340px compact) ── */}
        <div
          style={{
            width: "340px",
            background: "rgba(255,255,255,0.97)",
            borderRadius: "18px",
            boxShadow: "0 20px 60px rgba(0,0,0,0.28)",
            padding: "32px 28px 24px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {/* Blue icon */}
          <div
            style={{
              width: "58px", height: "58px",
              borderRadius: "16px",
              background: "linear-gradient(135deg, #1e57b0, #1877c4)",
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: "12px",
              boxShadow: "0 6px 18px rgba(30,87,176,0.32)",
            }}
          >
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
                  type="text"
                  placeholder="Enter username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
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
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{
                    width: "100%", height: "42px", paddingLeft: "34px", paddingRight: "40px",
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

            {/* Sign In button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%", height: "44px",
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
              {loading ? "Signing in..." : "Sign In"}
            </button>

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
              Fill Admin Credentials
            </button>
          </form>

          {/* Contact */}
          <div style={{
            marginTop: "16px",
            display: "flex", alignItems: "center", gap: "5px",
            color: "#8a9ab0", fontSize: "11px",
          }}>
            <Phone style={{ width: "12px", height: "12px" }} />
            Contact: +91 8005707783
          </div>
        </div>
      </div>

      {/* Footer */}
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
