import { businessDate } from "@/lib/businessDate";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { readBranchTable } from "@/lib/branchData";
import { appointmentMinutes } from "@/lib/appointmentTime";
import { recordId } from "@/lib/patientRecords";

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
  const { data: appointments } = useQuery({
    queryKey: ["notif-upcoming-appointments"],
    staleTime: 0,
    structuralSharing: false,
    refetchInterval: 5 * 60 * 1000, // har 5 minute check karo
    queryFn: async () => {
      const today = businessDate();
      const rows = await readBranchTable('appointments', null, '*, patients(name, mobile)');
      return rows.filter(a => a.date === today && (!a.status || a.status === 'Scheduled'));
    },
  });

  useEffect(() => {
    if (!appointments?.length || !isNotificationEnabled()) return;
    const notified = getNotifiedIds();
    const now = new Date();

    for (const appt of appointments as any[]) {
      const minutes = appointmentMinutes(appt.time_slot);
      const identity = `${recordId(appt.id)}:${appt.date}:${minutes}`;
      if (minutes === null || notified.has(identity)) continue;
      const apptTime = new Date(`${appt.date}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00+05:30`);
      const diffMin = (apptTime.getTime() - now.getTime()) / 60000;

      if (diffMin > 0 && diffMin <= 30) {
        const patientName = appt.patients?.name || "Patient";
        showNotification(
          "Upcoming Appointment",
          `${patientName} — ${appt.time_slot} baje (${Math.round(diffMin)} min baaki)`
        );
        notified.add(identity);
      }
    }
    saveNotifiedIds(notified);
  }, [appointments]);
}
