import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const src = fileURLToPath(new URL("../../../src", import.meta.url));

export default defineConfig({
  root: here,
  logLevel: "warn",
  resolve: { alias: { "@": src } },
  define: {
    "process.env.NEXT_PUBLIC_API_URL": JSON.stringify("http://harness.local/api/v1"),
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: process.env.MOCKUP_HARNESS_OUT || "/tmp/mockup-harness-dist",
    emptyOutDir: true,
    lib: { entry: "harness.tsx", formats: ["iife"], name: "MockupHarness", fileName: () => "bundle.js" },
    minify: false,
  },
});
