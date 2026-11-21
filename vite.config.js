import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import VueDevTools from "vite-plugin-vue-devtools";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // The build emits RELATIVE asset paths and bakes no URL in: the deployment
  // path lives in public/fm-config.js (see src/utils/appBase.js). The dev
  // server keeps serving /app/ as before.
  base: command === "build" ? "./" : "/app/",
  // The client name/version are put into the message tearline (#311)
  define: {
    __APP_NAME__: JSON.stringify(pkg.name),
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    vue(),
    VueDevTools(),
  ],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8443",
        changeOrigin: true,
        secure: false,
      },
      "/docs": {
        target: "http://localhost:8443",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.js"],
  },
}));
