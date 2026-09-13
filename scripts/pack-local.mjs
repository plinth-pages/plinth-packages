// Packs every package into dist-packs/ so plinth-template and plinth-platform can use them before they are published
// to npm. `pnpm pack` has no --filter, so it runs inside each package.
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const out = resolve("dist-packs");
mkdirSync(out, { recursive: true });

for (const pkg of ["core", "check", "integration-types", "github-stats", "leetcode-stats"]) {
  execSync(`pnpm pack --pack-destination "${out}"`, { cwd: resolve("packages", pkg), stdio: "inherit" });
}
