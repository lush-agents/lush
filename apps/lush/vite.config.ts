import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid(), tailwindcss()],
  clearScreen: false,
  server: {
    host: "0.0.0.0",
    port: 1420,
    strictPort: true
  },
  envPrefix: ["VITE_", "TAURI_"]
});
