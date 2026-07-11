// ─────────────────────────────────────────────────────────────────────────
// Shared QueryClient singleton
// ─────────────────────────────────────────────────────────────────────────
// Pehle App.tsx ke andar hi "const queryClient = new QueryClient()" tha,
// jise sirf React components access kar sakte the. offlineSync.ts (jo React
// component nahi hai — background sync engine hai) is queryClient ko
// invalidate nahi kar sakta tha, isliye Background Sync ke baad
// useSearchPatients() / usePatients() jaise React Query hooks purana
// (stale) cached result dikhate rehte the jab tak user retype / remount /
// window-refocus na kare.
//
// Ab queryClient yahan se export hota hai — App.tsx ise import karke
// QueryClientProvider mein use karta hai, aur offlineSync.ts bhi isi
// instance ko import karke Background Sync ke baad invalidateQueries() call
// kar sakta hai. Dono jagah EK HI instance use ho raha hai.

import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient();
