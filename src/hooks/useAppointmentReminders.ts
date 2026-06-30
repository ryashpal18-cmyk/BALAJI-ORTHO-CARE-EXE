import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isOnline } from "@/lib/offlineSync";

const NOTIFIED_KEY = "bocc_notified_appt_ids";

function getNotifiedIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(NOTIFIED_KEY) || "[]"));
  } catch {
    return new Set();
  }
}
function saveNotifiedIds(ids: Set<string>) {
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify(Array.from(ids)));
}

/** Permission maango — Settings page ya app load par ek baar call karo */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function isNotificationEnabled(): boolean {
  return "Notification" in window && Notification.permission === "granted";
}

function showNotification(title: string, body: string) {
  if (!isNotificationEnabled()) return;
  try {
    new Notification(title, { body, icon: "/favicon.ico" });
  } catch {
    /* ignore — some Electron/Capacitor builds restrict this */
  }
}

/**
 * App ke top-level (App.tsx) me ek baar mount karo. Har 5 minute me
 * upcoming appointments (agle 30 min ke andar) check karta hai aur
 * browser/desktop notification dikhata hai — ek appointment ke liye
 * sirf ek hi baar (duplicate notification nahi aayega).
 */
export function useAppointmentReminders() {
  const checkedRef = useRef(false);

  const { data: appointments } = useQuery({
    queryKey: ["notif-upcoming-appointments"],
    staleTime: 0,
    refetchInterval: 5 * 60 * 1000, // har 5 minute check karo
    queryFn: async () => {
      const online = await isOnline();
      if (!online || !isNotificationEnabled()) return [];
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("appointments")
        .select("id, date, time_slot, status, patients(name)")
        .eq("date", today)
        .neq("status", "Cancelled");
      if (error) return [];
      return data || [];
    },
  });

  useEffect(() => {
    if (!appointments?.length) return;
    const notified = getNotifiedIds();
    const now = new Date();

    for (const appt of appointments as any[]) {
      if (!appt.time_slot || notified.has(appt.id)) continue;
      // time_slot format expected "HH:MM" — parse karke compare karo
      const [h, m] = appt.time_slot.split(":").map(Number);
      if (Number.isNaN(h)) continue;
      const apptTime = new Date();
      apptTime.setHours(h, m || 0, 0, 0);
      const diffMin = (apptTime.getTime() - now.getTime()) / 60000;

      if (diffMin > 0 && diffMin <= 30) {
        const patientName = appt.patients?.name || "Patient";
        showNotification(
          "Upcoming Appointment",
          `${patientName} — ${appt.time_slot} baje (${Math.round(diffMin)} min baaki)`
        );
        notified.add(appt.id);
      }
    }
    saveNotifiedIds(notified);
  }, [appointments]);
}
