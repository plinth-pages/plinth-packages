import { validateManifest } from "@plinth-pages/integration-types";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import manifest from "../plinth.manifest.json";
import pkg from "../package.json";
import { LeetCodeStatsCard, loadLeetCodeStats } from "../src";

describe("manifest", () => {
  it("is valid and matches the package", () => {
    const result = validateManifest(manifest);
    expect(result.ok ? [] : result.issues).toEqual([]);
    expect(manifest.package).toBe(pkg.name);
    expect(manifest.version).toBe(pkg.version);
  });
});

describe("loadLeetCodeStats", () => {
  it("sends the username as a GraphQL variable and maps solved counts", async () => {
    let body: { query: string; variables: { username: string } } | undefined;
    const data = await loadLeetCodeStats('asha") { __schema }', async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          data: {
            matchedUser: {
              username: "asha",
              profile: { ranking: 123456 },
              submitStatsGlobal: { acSubmissionNum: [{ difficulty: "All", count: 420 }, { difficulty: "Easy", count: 200 }, { difficulty: "Medium", count: 180 }, { difficulty: "Hard", count: 40 }] },
            },
          },
        }),
      );
    });
    expect(body?.variables.username).toBe('asha") { __schema }');
    expect(body?.query).not.toContain("asha");
    expect(data).toEqual({ username: "asha", ranking: 123456, solved: { all: 420, easy: 200, medium: 180, hard: 40 } });
  });

  it("returns null for an unknown user or a failed request", async () => {
    expect(await loadLeetCodeStats("nobody", async () => new Response(JSON.stringify({ data: { matchedUser: null } })))).toBeNull();
    expect(await loadLeetCodeStats("x", async () => new Response("blocked", { status: 403 }))).toBeNull();
    expect(await loadLeetCodeStats("x", async () => Promise.reject(new Error("offline")))).toBeNull();
  });
});

describe("LeetCodeStatsCard", () => {
  it("renders totals by difficulty", () => {
    const html = renderToStaticMarkup(<LeetCodeStatsCard username="asha" data={{ username: "asha", ranking: 123456, solved: { all: 420, easy: 200, medium: 180, hard: 40 } }} />);
    expect(html).toContain("420");
    expect(html).toContain("ranking 123,456");
    expect(html).toContain("Medium");
  });

  it("says so when the data is unavailable", () => {
    expect(renderToStaticMarkup(<LeetCodeStatsCard username="asha" data={null} />)).toContain("unavailable right now");
  });
});
