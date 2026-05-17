import {
  LayoutDashboard,
  BedDouble,
  Calendar,
  Receipt,
  Activity,
  FileText,
  BarChart3,
  Settings,
  Stethoscope,
  LogOut,
  MessageCircle,
  MessageSquare,
  Pill,
  Bone,
  ClipboardList,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import logo from "@/assets/logo.png";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";

const menuItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "OPD", url: "/opd", icon: Stethoscope },
  { title: "IPD / Beds", url: "/ipd", icon: BedDouble },
  { title: "Appointments", url: "/appointments", icon: Calendar },
  { title: "Billing", url: "/billing", icon: Receipt },
  { title: "Cash Tally", url: "/cash-tally", icon: Receipt },
  { title: "Medicine Master", url: "/medicine-master", icon: Pill },
  { title: "Patient Medicine", url: "/patient-medicine", icon: ClipboardList },
  { title: "Medicine Commission", url: "/medicine-commission", icon: Pill },
  { title: "Physiotherapy", url: "/physiotherapy", icon: Activity },
  { title: "Ortho / Fracture", url: "/ortho", icon: Bone },
  { title: "Reports / X-Ray", url: "/reports", icon: FileText },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "WhatsApp", url: "/whatsapp", icon: MessageCircle },
  { title: "SMS Logs", url: "/sms-logs", icon: MessageSquare },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("userName");
    navigate("/login");
  };

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-white flex items-center justify-center flex-shrink-0 overflow-hidden">
            <img src={logo} alt="Balaji Ortho Care Center" className="h-full w-full object-contain" />
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-heading font-bold text-sm text-sidebar-primary-foreground truncate">
                Balaji Ortho Care
              </span>
              <span className="text-[10px] text-sidebar-foreground/60 truncate">
                Dr. S. S. Rathore
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/40 uppercase text-[10px] tracking-widest">
            Menu
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="h-4 w-4 mr-2 flex-shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="text-sidebar-foreground/50 hover:text-destructive"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4 mr-2" />
              {!collapsed && <span>Logout</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
