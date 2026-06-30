import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/themeContext";
import { Button } from "@/components/ui/button";

export function ThemeToggle({ collapsed }: { collapsed?: boolean }) {
  const { mode, toggleTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      onClick={toggleTheme}
      title={mode === "dark" ? "Light mode" : "Dark mode"}
      style={{
        display: "flex", alignItems: "center", gap: "10px",
        padding: "9px 10px", borderRadius: "10px",
        color: "rgba(255,255,255,0.75)",
        cursor: "pointer", width: "100%", justifyContent: "flex-start",
        background: "transparent", border: "none", fontSize: "13px",
      }}
    >
      {mode === "dark" ? (
        <Sun style={{ width: "16px", height: "16px" }} />
      ) : (
        <Moon style={{ width: "16px", height: "16px" }} />
      )}
      {!collapsed && <span>{mode === "dark" ? "Light Mode" : "Dark Mode"}</span>}
    </Button>
  );
}
