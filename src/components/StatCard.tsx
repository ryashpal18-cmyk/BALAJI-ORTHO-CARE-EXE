import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  variant?: "default" | "primary" | "secondary" | "success" | "warning" | "destructive";
}

const gradients: Record<string, string> = {
  primary:     "linear-gradient(135deg, #1a3a6b 0%, #1e57b0 100%)",
  secondary:   "linear-gradient(135deg, #1877c4 0%, #38b6ff 100%)",
  success:     "linear-gradient(135deg, #1a6b3a 0%, #1eb85c 100%)",
  warning:     "linear-gradient(135deg, #b87c1a 0%, #f5a623 100%)",
  destructive: "linear-gradient(135deg, #7b1a1a 0%, #e03e3e 100%)",
  default:     "linear-gradient(135deg, #3a4a6b 0%, #5a7ab0 100%)",
};

const iconBg: Record<string, string> = {
  primary:     "rgba(255,255,255,0.22)",
  secondary:   "rgba(255,255,255,0.22)",
  success:     "rgba(255,255,255,0.22)",
  warning:     "rgba(255,255,255,0.22)",
  destructive: "rgba(255,255,255,0.22)",
  default:     "rgba(255,255,255,0.22)",
};

export function StatCard({ title, value, icon: Icon, trend, variant = "default" }: StatCardProps) {
  return (
    <div
      className="stat-card"
      style={{
        background: gradients[variant],
        color: "white",
        border: "none",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Decorative circle */}
      <div style={{
        position: "absolute", top: "-18px", right: "-18px",
        width: "80px", height: "80px", borderRadius: "50%",
        background: "rgba(255,255,255,0.08)",
      }} />
      <div style={{
        position: "absolute", bottom: "-24px", right: "28px",
        width: "60px", height: "60px", borderRadius: "50%",
        background: "rgba(255,255,255,0.06)",
      }} />

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", position: "relative", zIndex: 1 }}>
        <div>
          <p style={{ fontSize: "12px", fontWeight: 500, opacity: 0.85, marginBottom: "6px", letterSpacing: "0.3px" }}>
            {title}
          </p>
          <p style={{ fontSize: "26px", fontWeight: 800, lineHeight: 1, fontFamily: "'Segoe UI', sans-serif" }}>
            {value}
          </p>
          {trend && (
            <p style={{ fontSize: "11px", marginTop: "6px", opacity: 0.85, fontWeight: 500 }}>
              {trend}
            </p>
          )}
        </div>
        <div style={{
          height: "42px", width: "42px", borderRadius: "12px",
          background: iconBg[variant],
          display: "flex", alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(4px)",
          flexShrink: 0,
        }}>
          <Icon style={{ width: "22px", height: "22px", color: "white" }} />
        </div>
      </div>
    </div>
  );
}
