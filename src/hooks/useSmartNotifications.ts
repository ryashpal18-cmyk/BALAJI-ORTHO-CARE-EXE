import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cacheGetAll } from "@/lib/offlineDb";
import { isOnline } from "@/lib/offlineSync";

export interface LowStockMed {
  id: string;
  name: string;
  stock: number;
  low_stock_alert: number;
}

export interface PendingDue {
  id: string;
  patient_id: string;
  amount: number;
  amount_paid: number;
  patients?: { name: string } | null;
}

// Low-stock medicines — agar `stock`/`low_stock_alert` columns DB mein nahi
// bane to silently empty list return karta hai (feature degrade gracefully).
export function useLowStockMedicines() {
  return useQuery({
    queryKey: ["notif-low-stock"],
    staleTime: 60000,
    queryFn: async (): Promise<LowStockMed[]> => {
      try {
        const { data, error } = await supabase
          .from("medicines" as any)
          .select("id, name, stock, low_stock_alert");
        if (error) throw error;
        return ((data as any[]) || []).filter(
          (m) => (m.stock ?? 999) <= (m.low_stock_alert ?? 10),
        );
      } catch {
        return [];
      }
    },
  });
}

// Pending / partial bills jinka due amount > 0 hai.
export function usePendingDuesNotif() {
  return useQuery({
    queryKey: ["notif-pending-dues"],
    staleTime: 60000,
    queryFn: async (): Promise<PendingDue[]> => {
      const online = await isOnline();
      if (online) {
        try {
          const { data, error } = await supabase
            .from("billing")
            .select("id, patient_id, amount, amount_paid, patients(name)")
            .in("status", ["Pending", "Partial"])
            .order("created_at", { ascending: false })
            .limit(20);
          if (error) throw error;
          return (data as any[]) || [];
        } catch {
          // fall through
        }
      }
      const cached = await cacheGetAll("billing");
      return cached.filter((b: any) => ["Pending", "Partial"].includes(b.status));
    },
  });
}

// Browser push permission state + helper to request it.
export function useBrowserPushPermission() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "unsupported",
  );

  const request = async () => {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
  };

  return { permission, request };
}

function pushOnceToday(key: string, title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  const flagKey = `bocc_push_${key}_${new Date().toISOString().slice(0, 10)}`;
  if (localStorage.getItem(flagKey)) return;
  try {
    new Notification(title, { body, icon: "/icon.png" });
    localStorage.setItem(flagKey, "1");
  } catch {
    // some browsers throw if not in a secure/permitted context — ignore
  }
}

// Day mein ek baar — aaj ke follow-ups aur low-stock medicines ke liye
// ek native browser push bhejta hai (agar permission mili hui hai).
export function useDailyPushReminders(todayFollowupCount: number, lowStockCount: number) {
  useEffect(() => {
    if (todayFollowupCount > 0) {
      pushOnceToday(
        "followups",
        "🦴 Aaj ke Follow-ups",
        `${todayFollowupCount} patient(s) ka follow-up aaj hai — Ortho Panel check karein.`,
      );
    }
  }, [todayFollowupCount]);

  useEffect(() => {
    if (lowStockCount > 0) {
      pushOnceToday(
        "lowstock",
        "💊 Stock Kam Hai",
        `${lowStockCount} medicine(s) ka stock khatam ho raha hai.`,
      );
    }
  }, [lowStockCount]);
}
