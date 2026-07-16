import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: Number(process.env.PORT) || 3000,
    strictPort: false,
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
