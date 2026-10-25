import fs from "node:fs";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase .env configuration missing");
  if (!key.startsWith("sb_publishable_")) {
    let role;
    try { role = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role; } catch {}
    if (role !== "anon") throw new Error("Only a public Supabase API key may be bundled");
  }
  fs.writeFileSync(path.resolve(__dirname, "auth-public-config.json"), JSON.stringify({ url, key }, null, 2) + "\n");
  return {
  base: "./",
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
