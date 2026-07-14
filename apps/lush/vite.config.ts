import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: "../..",
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname
    }
  },
  clearScreen: false,
  server: {
    host: "0.0.0.0",
    port: 5874,
    strictPort: true
  },
  envPrefix: ["VITE_", "TAURI_"]
});
