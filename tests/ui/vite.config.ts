import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
const project = fileURLToPath(new URL("../../", import.meta.url));
export default defineConfig({
  root: fileURLToPath(new URL("./fixture", import.meta.url)),
  publicDir: `${project}/public`,
  resolve: {
    alias: {
      "@": `${project}/src`,
      "next/navigation": fileURLToPath(
        new URL("./fixture/navigation.ts", import.meta.url),
      ),
      "next/link": fileURLToPath(
        new URL("./fixture/link.tsx", import.meta.url),
      ),
    },
  },
  esbuild: { jsx: "automatic" },
  server: {
    host: "127.0.0.1",
    port: 3017,
    strictPort: true,
    fs: { allow: [project] },
  },
});
