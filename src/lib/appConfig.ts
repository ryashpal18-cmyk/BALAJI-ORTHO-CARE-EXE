// ── Shared config utility for Balaji Ortho Care ──
// Sab kuch localStorage mein save hota hai (offline-first)

export const STORAGE_KEYS = {
  IS_LOGGED_IN:    "isLoggedIn",
  USER_NAME:       "userName",
  USER_ROLE:       "bocc_user_role",
  USER_PERMS:      "bocc_user_perms",
  STAFF_USERS:     "bocc_staff_users",
  DASH_MODULES:    "bocc_dash_modules",
  APP_THEME:       "bocc_app_theme",
  SERVICE_CATALOG: "bocc_service_catalog", // { id, name, rate }[]
};

// ── Types ──
export interface StaffUser {
  id: string;
  username: string;
  password: string;
  displayName: string;
  allowedPages: string[];   // array of route paths e.g. ['/dashboard', '/opd']
  createdAt: string;
}

export interface DashModules {
  statCards:      boolean;
  todayPatients:  boolean;
  pendingDues:    boolean;
  orthoPanel:     boolean;
}

export interface AppTheme {
  primaryColor: string;
  accentColor:  string;
}

// ── Defaults ──
export const DEFAULT_MODULES: DashModules = {
  statCards:     true,
  todayPatients: true,
  pendingDues:   true,
  orthoPanel:    true,
};

export const DEFAULT_THEME: AppTheme = {
  primaryColor: "#1e57b0",
  accentColor:  "#16a34a",
};

// ── Readers ──
export const getStaffUsers   = (): StaffUser[]  => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.STAFF_USERS) || "[]"); } catch { return []; }
};
export const getDashModules  = (): DashModules  => {
  try { return { ...DEFAULT_MODULES, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.DASH_MODULES) || "{}") }; } catch { return DEFAULT_MODULES; }
};
export const getAppTheme     = (): AppTheme     => {
  try { return { ...DEFAULT_THEME, ...JSON.parse(localStorage.getItem(STORAGE_KEYS.APP_THEME) || "{}") }; } catch { return DEFAULT_THEME; }
};
export const getCurrentRole  = (): "admin"|"staff" => (localStorage.getItem(STORAGE_KEYS.USER_ROLE) as any) || "admin";
export const getCurrentPerms = (): string[]       => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.USER_PERMS) || "[]"); } catch { return []; }
};

// ── Writers ──
export const saveStaffUsers  = (users: StaffUser[]) => localStorage.setItem(STORAGE_KEYS.STAFF_USERS, JSON.stringify(users));
export const saveDashModules = (m: DashModules)     => localStorage.setItem(STORAGE_KEYS.DASH_MODULES, JSON.stringify(m));
export const saveAppTheme    = (t: AppTheme)        => localStorage.setItem(STORAGE_KEYS.APP_THEME, JSON.stringify(t));

// ── All pages list ──
export const ALL_PAGES = [
  { path: "/dashboard",           label: "Dashboard" },
  { path: "/opd",                 label: "OPD" },
  { path: "/daily-cash-book",     label: "Daily Cash Book" },
  { path: "/ipd",                 label: "IPD / Beds" },
  { path: "/appointments",        label: "Appointments" },
  { path: "/billing",             label: "Billing" },
  { path: "/cash-tally",          label: "Cash Tally" },
  { path: "/medicine-master",     label: "Medicine Master" },
  { path: "/patient-medicine",    label: "Patient Medicine" },
  { path: "/medicine-commission", label: "Medicine Commission" },
  { path: "/physiotherapy",       label: "Physiotherapy" },
  { path: "/ortho",               label: "Ortho / Fracture" },
  { path: "/reports",             label: "Reports / X-Ray" },
  { path: "/analytics",           label: "Analytics" },
  { path: "/whatsapp",            label: "WhatsApp" },
  { path: "/sms-logs",            label: "SMS Logs" },
];

// ── Service Catalog (billing autocomplete) ──
export interface ServiceCatalogItem {
  id: string;
  name: string;
  rate: number;
}

export const getServiceCatalog = (): ServiceCatalogItem[] => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.SERVICE_CATALOG) || "[]"); } catch { return []; }
};

export const saveServiceCatalog = (items: ServiceCatalogItem[]) =>
  localStorage.setItem(STORAGE_KEYS.SERVICE_CATALOG, JSON.stringify(items));

/**
 * Bill save hone ke baad silently call hota hai — har service item ko
 * catalog mein yaad kar leta hai. Agar naam pehli baar aaya to nayi
 * entry banti hai, agar pehle se hai to rate update ho jata hai.
 */
export const learnServiceItems = (items: { name: string; amount: number }[]) => {
  if (!items.length) return;
  const catalog = getServiceCatalog();
  const byName = new Map(catalog.map((c) => [c.name.toLowerCase().trim(), c]));
  for (const { name, amount } of items) {
    const trimmed = name.trim();
    if (!trimmed || !amount) continue;
    const key = trimmed.toLowerCase();
    const existing = byName.get(key);
    if (existing) {
      existing.rate = amount; // rate update
    } else {
      const item: ServiceCatalogItem = {
        id: `svc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: trimmed,
        rate: amount,
      };
      catalog.push(item);
      byName.set(key, item);
    }
  }
  saveServiceCatalog(catalog);
};
