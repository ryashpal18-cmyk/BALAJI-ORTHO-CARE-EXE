import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─────────────────────────────────────────────────────────────────────────
// Mobile number validity check
//
// Rural clinic mein "0000000000", "1111111111" jaise dummy numbers form
// validation bypass karne ke liye type ho jaate hain (kyunki mobile field
// required hai). Ye number required check to paas kar jaate hain lekin
// SMS/WhatsApp gateway ko bhejne par hamesha fail hote hain, aur offline
// sync queue mein hamesha ke liye retry hote rehte hain (queue kabhi khaali
// nahi hota, logs bhi bharte rehte hain).
//
// Ye function sirf "kya ye ek bhejne-laayak Indian mobile number hai"
// check karta hai — patient registration ko block nahi karta (Dr chahe to
// phir bhi dummy number ke saath save kar sakta hai), sirf SMS/WhatsApp
// bhejne se pehle use kiya jaata hai taaki fizul retries na ho.
// ─────────────────────────────────────────────────────────────────────────
export function isValidMobile(mobile: string | null | undefined): boolean {
  let digits = String(mobile || "").replace(/\D/g, "");
  // Leading "91" country code hata do agar 12 digit ka number hai
  if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  }
  if (digits.length !== 10) return false;
  if (!/^[6-9]/.test(digits)) return false; // Indian mobile numbers 6-9 se start hote hain
  if (/^(\d)\1{9}$/.test(digits)) return false; // 0000000000, 9999999999 jaise repeated-digit dummy numbers
  return true;
}
