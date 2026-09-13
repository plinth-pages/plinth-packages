import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm"],
  dts: true,
  clean: true,
  // Server components: no "use client". React is the portfolio's own copy.
  external: ["react", "react/jsx-runtime"],
});
