import { Moon, Orbit, Sun } from "lucide-react";
import { useTheme } from "@/lib/themeContext";
import { Button } from "@/components/ui/button";

export function ThemeToggle({ collapsed }: { collapsed?: boolean }) {
  const { mode, toggleTheme } = useTheme();

  const next = mode === "scifi" ? { label: "Light Mode", Icon: Sun }
    : mode === "light" ? { label: "Dark Mode", Icon: Moon }
    : { label: "Sci-Fi Mode", Icon: Orbit };

  return (
    <Button
      variant="ghost"
      onClick={toggleTheme}
      title={next.label}
      aria-label={next.label}
      style={{
        display: "flex", alignItems: "center", gap: "10px",
        padding: "9px 10px", borderRadius: "10px",
        color: "rgba(255,255,255,0.75)",
        cursor: "pointer", width: "100%", justifyContent: "flex-start",
        background: "transparent", border: "none", fontSize: "13px",
      }}
    >
      <next.Icon size={16} />
      {!collapsed && <span>{next.label}</span>}
    </Button>
  );
}
