import {
  LayoutDashboard, BedDouble, Calendar, Receipt, Activity,
  FileText, BarChart3, Settings, Stethoscope, LogOut,
  MessageCircle, MessageSquare, Pill, Bone, ClipboardList, RefreshCw, FilePlus2, IndianRupee,
  Package, ShieldCheck, ShieldPlus, Building2, CalendarCheck, Wallet,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import logo from "@/assets/logo.png";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter, SidebarHeader, useSidebar,
} from "@/components/ui/sidebar";
import { getCurrentRole, getCurrentPerms } from "@/lib/appConfig";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BranchSelector } from "@/components/BranchSelector";

const ALL_MENU_ITEMS = [
  { title: "Dashboard",           url: "/dashboard",           icon: LayoutDashboard },
  { title: "OPD",                 url: "/opd",                 icon: Stethoscope },
  { title: "Daily Cash Book",     url: "/daily-cash-book",     icon: Wallet },
  { title: "IPD / Beds",          url: "/ipd",                 icon: BedDouble },
  { title: "Appointments",        url: "/appointments",        icon: Calendar },
  { title: "Prescription Pad",    url: "/prescription",        icon: FilePlus2 },
  { title: "Billing",             url: "/billing",             icon: Receipt },
  { title: "Due Amount",          url: "/due-amount",          icon: IndianRupee },
  { title: "Cash Tally",          url: "/cash-tally",          icon: Receipt },
  { title: "Medicine Master",     url: "/medicine-master",     icon: Pill },
  { title: "Inventory / Stock",   url: "/inventory",           icon: Package },
  { title: "Patient Medicine",    url: "/patient-medicine",    icon: ClipboardList },
  { title: "Medicine Commission", url: "/medicine-commission", icon: Pill },
  { title: "Physiotherapy",       url: "/physiotherapy",       icon: Activity },
  { title: "Ortho / Fracture",    url: "/ortho",               icon: Bone },
  { title: "Reports / X-Ray",     url: "/reports",             icon: FileText },
  { title: "PlasterSync",         url: "/plaster-sync",        icon: RefreshCw },
  { title: "Analytics",           url: "/analytics",           icon: BarChart3 },
  { title: "Revenue Dashboard",   url: "/revenue-dashboard",   icon: IndianRupee },
  { title: "WhatsApp",            url: "/whatsapp",            icon: MessageCircle },
  { title: "SMS Logs",            url: "/sms-logs",            icon: MessageSquare },
  { title: "Insurance Claims",    url: "/insurance-claims",    icon: ShieldPlus },
  { title: "Booking Requests",    url: "/booking-requests",    icon: CalendarCheck },
  { title: "Branches",            url: "/branches",            icon: Building2 },
  { title: "Audit Log",           url: "/audit-log",           icon: ShieldCheck },
  { title: "Settings",            url: "/settings",            icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed  = state === "collapsed";
  const location   = useLocation();
  const navigate   = useNavigate();
  const role       = getCurrentRole();
  const perms      = getCurrentPerms();
  const isAdmin    = role === "admin";

  const menuItems = ALL_MENU_ITEMS.filter(item => {
    if (isAdmin) return true;
    if (item.url === "/settings" || item.url === "/audit-log" || item.url === "/branches") return false;
    return perms.includes(item.url);
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("userName");
    localStorage.removeItem("bocc_user_role");
    localStorage.removeItem("bocc_user_perms");
    navigate("/login");
  };

  const userName = localStorage.getItem("userName") || "DR";
  const initials = isAdmin ? "DR" : userName.substring(0, 2).toUpperCase();

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader style={{ padding: "0", background: "transparent" }}>
        <div style={{
          padding: collapsed ? "16px 10px" : "16px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex", alignItems: "center", gap: "12px",
        }}>
          <div style={{
            height: "40px", width: "40px", borderRadius: "12px",
            background: "rgba(255,255,255,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, overflow: "hidden",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}>
            <img src={logo} alt="Balaji" style={{ height: "100%", width: "100%", objectFit: "contain" }} />
          </div>
          {!collapsed && (
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span style={{
                fontWeight: 800, fontSize: "13px", color: "white",
                letterSpacing: "0.3px", lineHeight: 1.2,
              }}>
                Balaji Ortho Care
              </span>
              <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.55)", marginTop: "2px" }}>
                {isAdmin ? "Dr. S. S. Rathore" : userName}
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <BranchSelector collapsed={collapsed} />

      <SidebarContent style={{ padding: "8px 0" }}>
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel style={{
              fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase",
              color: "rgba(255,255,255,0.35)", padding: "8px 16px 4px",
            }}>
              Navigation
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const isActive = location.pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={item.url === "/"}
                        style={{
                          display: "flex", alignItems: "center",
                          gap: "10px",
                          padding: collapsed ? "10px 14px" : "9px 14px",
                          margin: "1px 8px",
                          borderRadius: "10px",
                          fontSize: "13px",
                          fontWeight: isActive ? 600 : 400,
                          color: isActive ? "white" : "rgba(255,255,255,0.65)",
                          background: isActive
                            ? "linear-gradient(135deg, rgba(30,87,176,0.9), rgba(30,180,100,0.5))"
                            : "transparent",
                          boxShadow: isActive ? "0 2px 8px rgba(0,0,0,0.2)" : "none",
                          transition: "all 0.15s ease",
                          textDecoration: "none",
                        }}
                        activeClassName=""
                        className="sidebar-link"
                      >
                        <item.icon style={{
                          width: "16px", height: "16px", flexShrink: 0,
                          color: isActive ? "white" : "rgba(255,255,255,0.55)",
                        }} />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter style={{ padding: "8px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        {!collapsed && (
          <div style={{
            padding: "8px 10px", borderRadius: "10px",
            background: "rgba(255,255,255,0.06)", marginBottom: "6px",
          }}>
            <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.5)", lineHeight: 1.5 }}>
              🏥 Balaji Ortho Care Center<br />
              <span style={{ color: "rgba(255,255,255,0.35)" }}>
                {isAdmin ? "Admin" : `Staff · ${menuItems.length} pages`}
              </span>
            </p>
          </div>
        )}
        <SidebarMenu>
          <SidebarMenuItem>
            <ThemeToggle collapsed={collapsed} />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleLogout}
              style={{
                display: "flex", alignItems: "center", gap: "10px",
                padding: "9px 10px", borderRadius: "10px",
                color: "rgba(255,100,100,0.85)",
                cursor: "pointer", width: "100%",
                transition: "all 0.15s ease",
                background: "transparent", border: "none",
                fontSize: "13px",
              }}
            >
              <LogOut style={{ width: "16px", height: "16px" }} />
              {!collapsed && <span>Logout</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
