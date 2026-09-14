import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm"],
  dts: true,
  clean: true,
  // A client component: the directive must survive bundling.
  banner: { js: '"use client";' },
  external: ["react", "react/jsx-runtime"],
});
