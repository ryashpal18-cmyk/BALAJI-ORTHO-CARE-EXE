import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  variant?: "default" | "primary" | "secondary" | "success" | "warning" | "destructive";
}

const variantStyles = {
  default: "bg-card",
  primary: "bg-primary/10",
  secondary: "bg-secondary/10",
  success: "bg-success/10",
  warning: "bg-warning/10",
  destructive: "bg-destructive/10",
};

const iconStyles = {
  default: "text-muted-foreground",
  primary: "text-primary",
  secondary: "text-secondary",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
};

export function StatCard({ title, value, icon: Icon, trend, variant = "default" }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold font-heading mt-1">{value}</p>
          {trend && <p className="text-xs text-success mt-1">{trend}</p>}
        </div>
        <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", variantStyles[variant])}>
          <Icon className={cn("h-5 w-5", iconStyles[variant])} />
        </div>
      </div>
    </div>
  );
}
