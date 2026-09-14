import { validateManifest } from "@plinth-pages/integration-types";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import manifest from "../plinth.manifest.json";
import pkg from "../package.json";
import { VisitorCounter, formatVisitors, loadVisitorCount } from "../src";

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};

describe("manifest", () => {
  it("is valid, matches the package, and has its site id and endpoint injected by Plinth", () => {
    const result = validateManifest(manifest);
    expect(result.ok ? [] : result.issues).toEqual([]);
    expect(manifest.package).toBe(pkg.name);
    expect(manifest.version).toBe(pkg.version);
    expect(manifest.injected).toEqual({ siteId: "portfolioId", endpoint: "publicApiUrl" });
  });
});

describe("loadVisitorCount", () => {
  it("counts the first visit in a session, then only reads", async () => {
    const calls: string[] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method} ${url}`);
      return new Response(JSON.stringify({ count: 42 }));
    }) as unknown as typeof fetch;
    const storage = memory();
    expect(await loadVisitorCount("site 1", "https://api.example/", fake, storage)).toBe(42);
    expect(await loadVisitorCount("site 1", "https://api.example/", fake, storage)).toBe(42);
    expect(calls).toEqual(["POST https://api.example/v1/public/counter/site%201", "GET https://api.example/v1/public/counter/site%201"]);
  });

  it("returns null — and renders nothing — when the counter is down or answers nonsense", async () => {
    expect(await loadVisitorCount("s", "https://api.example", (async () => Promise.reject(new Error("offline"))) as unknown as typeof fetch)).toBeNull();
    expect(await loadVisitorCount("s", "https://api.example", (async () => new Response("", { status: 503 })) as unknown as typeof fetch)).toBeNull();
    expect(await loadVisitorCount("s", "https://api.example", (async () => new Response(JSON.stringify({ count: "lots" }))) as unknown as typeof fetch)).toBeNull();
    expect(renderToStaticMarkup(<VisitorCounter siteId="s" endpoint="https://api.example" />)).toBe("");
  });
});

describe("formatVisitors", () => {
  it("keeps small numbers exact and shortens large ones", () => {
    expect([formatVisitors(7), formatVisitors(1234), formatVisitors(56_000), formatVisitors(2_400_000)]).toEqual(["7", "1,234", "56k", "2.4M"]);
  });
});
