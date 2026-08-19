import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: __dirname,
  base: "./",
  server: {
    // Bind IPv4 explicitly — wait-on/Electron on Windows often fail if Vite is ::1-only
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    watch: {
      // Electron main/preload are not Vite modules — avoid spurious full reloads
      ignored: ["**/electron/**", "**/dist/**", "**/node_modules/**"],
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@": path.join(__dirname, "src"),
    },
  },
});
