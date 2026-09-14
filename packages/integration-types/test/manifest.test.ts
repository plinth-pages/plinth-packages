import { describe, expect, it } from "vitest";
import { propsSchemaFor, validateManifest } from "../src";

const githubStats = {
  id: "github-stats",
  name: "GitHub Stats",
  description: "Public repositories, followers and stars for a GitHub account.",
  category: "coding",
  package: "@plinth-pages/github-stats",
  version: "0.1.0",
  component: { import: "GitHubStats" },
  defaultSlot: "afterProjects",
  allowedSlots: ["heroAfter", "beforeProjects", "afterProjects", "sidebar"],
  props: [
    { name: "username", label: "GitHub username", type: "string", required: true, pattern: "[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})" },
    { name: "showTopRepos", label: "Show top repositories", type: "boolean", default: true },
  ],
};

const issuesOf = (raw: unknown) => {
  const result = validateManifest(raw);
  return result.ok ? [] : result.issues.map((i) => `${i.path}: ${i.message}`);
};

describe("validateManifest", () => {
  it("accepts a well-formed manifest and fills defaults", () => {
    const result = validateManifest(githubStats);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.component.kind).toBe("element");
      expect(result.manifest.secrets).toEqual([]);
    }
  });

  it("rejects slots outside the vocabulary", () => {
    expect(issuesOf({ ...githubStats, allowedSlots: ["afterProjects", "banner"] }).join()).toMatch(/allowedSlots\.1/);
    expect(issuesOf({ ...githubStats, defaultSlot: "banner" }).join()).toMatch(/defaultSlot/);
  });

  it("requires the default slot to be allowed", () => {
    expect(issuesOf({ ...githubStats, defaultSlot: "footer" })).toContain("defaultSlot: defaultSlot must be one of allowedSlots");
  });

  it("keeps providers and elements in their own slots", () => {
    expect(issuesOf({ ...githubStats, allowedSlots: ["providers"], defaultSlot: "providers" }).join()).toMatch(/only accepts providers/);
    expect(issuesOf({ ...githubStats, props: [], component: { import: "Theme", kind: "provider" } }).join()).toMatch(/only be placed in the providers slot/);
  });

  it.each(["dangerouslySetInnerHTML", "children", "style", "onClick", "not valid"])("refuses the prop name %j", (name) => {
    expect(issuesOf({ ...githubStats, props: [{ name, label: "x", type: "string" }] }).length).toBeGreaterThan(0);
  });

  it("requires exact versions, valid package names and component identifiers", () => {
    expect(issuesOf({ ...githubStats, version: "^0.1.0" }).join()).toMatch(/exact version/);
    expect(issuesOf({ ...githubStats, package: "Not A Package" }).join()).toMatch(/npm package/);
    expect(issuesOf({ ...githubStats, component: { import: "githubStats" } }).join()).toMatch(/capital letter/);
    expect(issuesOf({ ...githubStats, id: "imports" }).join()).toMatch(/reserved/);
  });

  it("accepts secrets, server route files under the integration's own folder, and injected props", () => {
    const result = validateManifest({
      ...githubStats,
      secrets: [{ env: "RESEND_API_KEY", label: "Resend API key", provider: "resend" }],
      files: [{ path: "app/api/plinth/github-stats/route.ts", source: "templates/route.ts" }],
      injected: { siteId: "portfolioId" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.manifest.secrets[0]).toMatchObject({ kind: "api_key", required: true });
  });

  it("refuses secrets that would reach the browser or clash with the platform", () => {
    expect(issuesOf({ ...githubStats, secrets: [{ env: "NEXT_PUBLIC_RESEND_KEY", label: "x" }] }).join()).toMatch(/expose/);
    expect(issuesOf({ ...githubStats, secrets: [{ env: "VERCEL_TOKEN", label: "x" }] }).join()).toMatch(/expose|clash/);
    expect(issuesOf({ ...githubStats, secrets: [{ env: "lowercase", label: "x" }] }).join()).toMatch(/UPPER_SNAKE_CASE/);
    expect(issuesOf({ ...githubStats, secrets: [{ env: "A_KEY", label: "x" }, { env: "A_KEY", label: "y" }] }).join()).toMatch(/Duplicate/);
  });

  it("refuses files outside the integration's own API folder", () => {
    expect(issuesOf({ ...githubStats, files: [{ path: "app/page.tsx", source: "templates/route.ts" }] }).join()).toMatch(/route\.ts handlers/);
    expect(issuesOf({ ...githubStats, files: [{ path: "app/api/plinth/other/route.ts", source: "templates/route.ts" }] }).join()).toMatch(/github-stats/);
    expect(issuesOf({ ...githubStats, files: [{ path: "app/api/plinth/github-stats/route.ts", source: "../../etc/passwd" }] }).join()).toMatch(/templates/);
  });

  it("refuses injected props that collide with user props", () => {
    expect(issuesOf({ ...githubStats, injected: { username: "portfolioId" } }).join()).toMatch(/also a user prop/);
    expect(issuesOf({ ...githubStats, injected: { siteId: "somethingElse" } }).length).toBeGreaterThan(0);
  });
});

describe("propsSchemaFor", () => {
  const result = validateManifest(githubStats);
  if (!result.ok) throw new Error("fixture");
  const schema = propsSchemaFor(result.manifest);

  it("applies defaults and trims strings", () => {
    expect(schema.parse({ username: "  sumitverma77 " })).toEqual({ username: "sumitverma77", showTopRepos: true });
  });

  it("enforces required values, patterns and types", () => {
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ username: '"} /><script>alert(1)</script>' }).success).toBe(false);
    expect(schema.safeParse({ username: "ok", showTopRepos: "yes" }).success).toBe(false);
  });

  it("rejects props the manifest doesn't declare", () => {
    expect(schema.safeParse({ username: "ok", dangerouslySetInnerHTML: { __html: "x" } }).success).toBe(false);
  });
});
