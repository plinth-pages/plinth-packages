import { validateManifest } from "@plinth-pages/integration-types";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import manifest from "../plinth.manifest.json";
import pkg from "../package.json";
import { GitHubStatsCard, formatCount, loadGitHubStats } from "../src";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("manifest", () => {
  it("is valid and matches the package", () => {
    const result = validateManifest(manifest);
    expect(result.ok ? [] : result.issues).toEqual([]);
    expect(manifest.package).toBe(pkg.name);
    expect(manifest.version).toBe(pkg.version);
  });
});

describe("loadGitHubStats", () => {
  it("sums stars over non-fork repositories and picks the top three, cached for an hour", async () => {
    const calls: { url: string; init: unknown }[] = [];
    const data = await loadGitHubStats("octo cat", async (url, init) => {
      calls.push({ url, init });
      return url.includes("/repos")
        ? json([
            { name: "a", html_url: "https://github.com/o/a", stargazers_count: 5, language: "TypeScript", fork: false },
            { name: "b", html_url: "https://github.com/o/b", stargazers_count: 50, language: null, fork: false },
            { name: "fork", html_url: "https://github.com/o/fork", stargazers_count: 999, language: "Go", fork: true },
            { name: "c", html_url: "https://github.com/o/c", stargazers_count: 7, language: "Rust", fork: false },
            { name: "d", html_url: "https://github.com/o/d", stargazers_count: 1, language: "Go", fork: false },
          ])
        : json({ login: "octocat", name: "The Octocat", html_url: "https://github.com/octocat", public_repos: 8, followers: 12000 });
    });

    expect(calls.map((c) => c.url)).toEqual([
      "https://api.github.com/users/octo%20cat",
      "https://api.github.com/users/octo%20cat/repos?per_page=100&type=owner&sort=updated",
    ]);
    expect(calls[0].init).toMatchObject({ next: { revalidate: 3600 } });
    expect(data).toMatchObject({ login: "octocat", stars: 63, publicRepos: 8, followers: 12000 });
    expect(data?.topRepos.map((r) => r.name)).toEqual(["b", "c", "a"]);
  });

  it("returns null instead of throwing when GitHub fails", async () => {
    expect(await loadGitHubStats("x", async () => json({ message: "Not Found" }, 404))).toBeNull();
    expect(await loadGitHubStats("x", async () => Promise.reject(new Error("offline")))).toBeNull();
  });
});

describe("GitHubStatsCard", () => {
  it("renders the numbers, and escapes everything it prints", () => {
    const html = renderToStaticMarkup(
      <GitHubStatsCard
        username="octocat"
        data={{ login: "octocat", name: null, profileUrl: "https://github.com/octocat", publicRepos: 8, followers: 12000, stars: 1500, topRepos: [{ name: "<img onerror>", url: "https://github.com/o/x", stars: 3, language: "Go" }] }}
      />,
    );
    expect(html).toContain("@octocat");
    expect(html).toContain("12k");
    expect(html).toContain("1.5k");
    expect(html).toContain("&lt;img onerror&gt;");
    expect(html).not.toContain("<img");
  });

  it("says so when the data is unavailable", () => {
    expect(renderToStaticMarkup(<GitHubStatsCard username="octocat" data={null} />)).toContain("unavailable right now");
  });

  it("formats counts", () => {
    expect([formatCount(999), formatCount(1000), formatCount(1540), formatCount(25_400), formatCount(2_000_000)]).toEqual(["999", "1k", "1.5k", "25k", "2m"]);
  });
});
