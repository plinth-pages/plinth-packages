import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/slots.ts", "src/plinth-json.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  external: ["react", "react/jsx-runtime"],
});
