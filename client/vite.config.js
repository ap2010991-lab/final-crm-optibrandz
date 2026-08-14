import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// In production the API and the built client are served from one origin. Proxying /api
// locally reproduces that, so development behaves the same way as the deployed app.
const apiProxy = {
  "/api": {
    target: process.env.VITE_DEV_API_ORIGIN || "http://localhost:3001",
    changeOrigin: false
  }
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy }
});
