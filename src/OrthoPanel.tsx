import { useState, useEffect, useRef } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Bell, Search, X, Bone, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useFollowupsAround } from "@/hooks/useOrtho";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [showDrop, setShowDrop] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);

  const { data: followups } = useFollowupsAround();
  const t = todayStr();
  const todayFu = (followups || []).filter(
    (c: any) => c.next_followup_date === t,
  );
  const missedFu = (followups || []).filter(
    (c: any) =>
      c.next_followup_date &&
      c.next_followup_date < t &&
      c.plaster_status === "Active",
  );
  const notifCount = todayFu.length + missedFu.length;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowDrop(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setShowDrop(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("patients")
        .select("id, name, mobile, age, gender")
        .ilike("name", `%${query}%`)
        .limit(8);
      setResults(data || []);
      setShowDrop(true);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (patient: any) => {
    setQuery("");
    setShowDrop(false);
    navigate(`/patient-profile/${patient.id}`);
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b bg-card px-4 gap-4 no-print">
            <div className="flex items-center gap-2 flex-1">
              <SidebarTrigger />
              <div className="hidden sm:flex relative w-72" ref={wrapRef}>
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground z-10" />
                <Input
                  placeholder="Patient name search..."
                  className="pl-9 h-9 bg-muted/50 border-0"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => results.length > 0 && setShowDrop(true)}
                />
                {query && (
                  <button
                    onClick={() => {
                      setQuery("");
                      setShowDrop(false);
                    }}
                    className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {showDrop && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-card border rounded-xl shadow-lg z-50 overflow-hidden">
                    {loading ? (
                      <div className="p-3 text-sm text-center text-muted-foreground">
                        Searching...
                      </div>
                    ) : results.length === 0 ? (
                      <div className="p-3 text-sm text-center text-muted-foreground">
                        Koi patient nahi mila
                      </div>
                    ) : (
                      <div className="divide-y max-h-72 overflow-auto">
                        {results.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => handleSelect(p)}
                            className="w-full text-left px-4 py-2.5 hover:bg-accent transition-colors flex items-center justify-between"
                          >
                            <div>
                              <p className="text-sm font-medium">{p.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {p.mobile || "No mobile"}
                                {p.age ? ` • ${p.age} yrs` : ""}
                                {p.gender ? ` • ${p.gender}` : ""}
                              </p>
                            </div>
                            <span className="text-xs text-primary">View →</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-4 w-4" />
                    {notifCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground flex items-center justify-center">
                        {notifCount}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-0">
                  <div className="p-3 border-b flex items-center gap-2">
                    <Bone className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-sm">
                      Ortho Follow-ups
                    </span>
                  </div>
                  <div className="max-h-80 overflow-auto">
                    {notifCount === 0 ? (
                      <p className="p-4 text-sm text-center text-muted-foreground">
                        Koi follow-up nahi
                      </p>
                    ) : (
                      <>
                        {todayFu.length > 0 && (
                          <div className="p-2">
                            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-info flex items-center gap-1">
                              <CalendarClock className="h-3 w-3" />
                              आज ({todayFu.length})
                            </p>
                            {todayFu.map((c: any) => (
                              <button
                                key={c.id}
                                onClick={() => navigate("/ortho")}
                                className="w-full text-left px-2 py-2 rounded hover:bg-accent flex items-center justify-between"
                              >
                                <div>
                                  <p className="text-sm font-medium">
                                    {c.patients?.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {c.side} {c.body_part} · {c.plaster_type}
                                  </p>
                                </div>
                                <Badge variant="outline" className="text-[10px]">
                                  {c.plaster_status}
                                </Badge>
                              </button>
                            ))}
                          </div>
                        )}
                        {missedFu.length > 0 && (
                          <div className="p-2 border-t">
                            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                              Missed ({missedFu.length})
                            </p>
                            {missedFu.map((c: any) => (
                              <button
                                key={c.id}
                                onClick={() => navigate("/ortho")}
                                className="w-full text-left px-2 py-2 rounded hover:bg-accent flex items-center justify-between"
                              >
                                <div>
                                  <p className="text-sm font-medium">
                                    {c.patients?.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {c.next_followup_date} · {c.body_part}
                                  </p>
                                </div>
                                <Badge
                                  variant="destructive"
                                  className="text-[10px]"
                                >
                                  Missed
                                </Badge>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div className="p-2 border-t">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full"
                      onClick={() => navigate("/ortho")}
                    >
                      View all in Ortho Panel
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                <span className="text-xs font-bold text-primary-foreground">
                  DR
                </span>
              </div>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
