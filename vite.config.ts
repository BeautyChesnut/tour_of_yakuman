import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  define: {
    "process.env.NODE_DEBUG": "undefined",
    "process.env.NODE_ENV": '"production"'
  },
  build: {
    outDir: "../dist/web",
    emptyOutDir: true
  }
});
