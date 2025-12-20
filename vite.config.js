import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            console.log("→ Backend:", req.method, req.url);
          });
          proxy.on("proxyRes", (proxyRes, req) => {
            console.log("← Backend Response:", proxyRes.statusCode, req.url);
          });
          proxy.on("error", (err, req) => {
            console.log("Proxy Error:", err.message, req.url);
          });
        },
      },
    },
  },
});
