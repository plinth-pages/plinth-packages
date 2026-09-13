import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  // Both formats: the platform's worker is CommonJS. The slot vocabulary is bundled in, so the manifest schema
  // always matches the core version it was built against and nothing else is needed at runtime.
  format: ["esm", "cjs"],
  dts: { resolve: ["@plinth-pages/core"] },
  clean: true,
  noExternal: ["@plinth-pages/core"],
  external: ["zod", "react", "react/jsx-runtime"],
});
