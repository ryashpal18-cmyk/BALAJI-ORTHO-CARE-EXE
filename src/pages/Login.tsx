import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Stethoscope, Eye, EyeOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const ADMIN_EMAIL = "yashpal18@balajiclinic.local";
const ADMIN_PASSWORD = "Aarya@2019";

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Map username to email
      if (username !== "Yashpal18" || password !== "Aarya@2019") {
        toast({ title: "Login Failed", description: "Invalid username or password", variant: "destructive" });
        setLoading(false);
        return;
      }

      // Ensure admin user exists (idempotent)
      await supabase.functions.invoke("create-admin-user", {
        body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      });

      // Sign in with Supabase Auth
      const { error } = await supabase.auth.signInWithPassword({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      });

      if (error) throw error;

      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem("userName", username);
      navigate("/dashboard");
    } catch (err: any) {
      toast({
        title: "Login Failed",
        description: err.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5 p-4">
      <Card className="w-full max-w-sm shadow-xl border-0">
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
            <Stethoscope className="h-8 w-8 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-heading font-bold text-xl">Balaji Ortho Care</h1>
            <p className="text-xs text-muted-foreground mt-1">
              Dr. S. S. Rathore (DMRT | BPT)
            </p>
            <p className="text-[10px] text-muted-foreground">
              Khinwara, Rajasthan – 306502
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label>Username</Label>
              <Input
                type="text"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Contact: +91 8005707783
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
