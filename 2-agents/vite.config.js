import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5179,
    proxy: {
      "/api": "http://127.0.0.1:9501",
      "/ws": { target: "ws://127.0.0.1:9501", ws: true },
    },
  },
  build: { outDir: "dist" },
});
