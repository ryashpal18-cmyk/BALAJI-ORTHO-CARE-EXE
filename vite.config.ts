import fs from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(({ mode }) => {
  const backend = JSON.parse(fs.readFileSync(path.resolve(__dirname, "auth-public-config.json"), "utf8"));
  const {url,key} = backend;
  if (!url || !key) throw new Error("Clinic backend configuration missing");
  if (!key.startsWith("sb_publishable_")) {
    let role;
    try { role = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role; } catch {}
    if (role !== "anon") throw new Error("Only a public Supabase API key may be bundled");
  }

  return {
  base: "./",
  // The renderer and native process share one clinic backend, overriding stale build env.
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(url),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(key),
    "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(new URL(url).hostname.split(".")[0]),
  },
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
    extensions: [".mjs", ".js", ".ts", ".tsx", ".jsx", ".json"],
  },
  build: {
    outDir: "dist",
    assetsInlineLimit: 300000, // Bundle the final letterpad as data for offline/native printing.
    emptyOutDir: true,
    assetsDir: "assets",
    rollupOptions: {
      output: {
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
  server: { port: 5173 },
};
});
