import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, User, Lock, Shield, Users, BarChart2, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import logoImg from "@/assets/logo.png";
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

  const handleAdminLogin = async () => {
    setUsername(LOCAL_USERNAME);
    setPassword(LOCAL_PASSWORD);
  };

  return (
    <div className="min-h-screen flex" style={{ fontFamily: "'Segoe UI', sans-serif" }}>
      {/* ── Left Panel ── */}
      <div
        className="hidden lg:flex flex-col items-center justify-center w-1/2 relative overflow-hidden"
        style={{
          backgroundImage: `url(${loginBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        {/* overlay */}
        <div className="absolute inset-0" style={{ background: "rgba(10,30,70,0.45)" }} />
        <div className="relative z-10 flex flex-col items-center gap-6 px-10 text-white text-center">
          <img src={logoImg} alt="Balaji Ortho Care" className="w-52 drop-shadow-2xl" />
        </div>
      </div>

      {/* ── Right Panel ── */}
      <div className="flex flex-col justify-between w-full lg:w-1/2 bg-white px-8 py-8">
        {/* Top logo (mobile only) */}
        <div className="flex justify-center lg:hidden mb-6">
          <img src={logoImg} alt="Balaji Ortho Care" className="w-36" />
        </div>

        {/* Form area */}
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-md">
            {/* Header */}
            <div className="text-center mb-8">
              <div
                className="mx-auto mb-4 flex items-center justify-center rounded-full w-20 h-20 shadow-lg"
                style={{ background: "linear-gradient(135deg, #e8eef7, #c8d8f0)" }}
              >
                <User className="w-10 h-10" style={{ color: "#1a3a6b" }} />
              </div>
              <h2 className="text-3xl font-bold" style={{ color: "#1a2a4a" }}>Welcome Back!</h2>
              <p className="text-gray-500 mt-1">Login to your account</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              {/* Username */}
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="pl-10 h-12 border-gray-300 rounded-xl focus:ring-2"
                  style={{ fontSize: "15px" }}
                />
              </div>

              {/* Password */}
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pl-10 pr-10 h-12 border-gray-300 rounded-xl focus:ring-2"
                  style={{ fontSize: "15px" }}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>

              {/* Remember / Forgot */}
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 text-gray-600 cursor-pointer">
                  <input type="checkbox" className="rounded" />
                  Remember me
                </label>
                <span className="cursor-pointer font-medium" style={{ color: "#1a7abf" }}>
                  Forgot Password?
                </span>
              </div>

              {/* Login button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 text-white font-bold rounded-xl shadow-md text-base transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #1a3a6b, #2e7d32)" }}
              >
                {loading ? "Signing in..." : "Login"}
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 text-gray-400 text-sm">
                <div className="flex-1 h-px bg-gray-200" />
                OR
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              {/* Admin Login */}
              <button
                type="button"
                onClick={handleAdminLogin}
                className="w-full h-12 flex items-center justify-center gap-2 border border-gray-200 rounded-xl text-gray-700 font-medium bg-gray-50 hover:bg-gray-100 transition text-sm"
              >
                <User className="w-4 h-4" />
                Login with Admin
              </button>
            </form>

            {/* Feature badges */}
            <div className="grid grid-cols-4 gap-3 mt-8 text-center">
              {[
                { icon: Shield, label: "Secure\nAccess" },
                { icon: Users, label: "User\nFriendly" },
                { icon: BarChart2, label: "Reports &\nAnalytics" },
                { icon: Settings, label: "Manage\nEasily" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex flex-col items-center gap-1">
                  <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                    <Icon className="w-5 h-5" style={{ color: "#1a3a6b" }} />
                  </div>
                  <p className="text-[10px] text-gray-500 whitespace-pre-line leading-tight">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="mt-6 rounded-xl flex items-center justify-between px-5 py-3 text-white text-xs"
          style={{ background: "linear-gradient(135deg, #1a3a6b, #2e7d32)" }}
        >
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            <span>Your Health, Our Priority</span>
          </div>
          <span>© 2024 Balaji Ortho Care Center. All Rights Reserved.</span>
        </div>
      </div>
    </div>
  );
}
