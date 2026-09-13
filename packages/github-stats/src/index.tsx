import type { CSSProperties } from "react";

/**
 * GitHub Stats — a Plinth integration. Public data only, fetched on the server and cached for an hour, so GitHub's
 * rate limit applies per deployment, not per visitor. It never throws: if GitHub is unreachable the card says so and
 * the rest of the page renders.
 */

export interface GitHubStatsProps {
  username: string;
  showTopRepos?: boolean;
}

export interface GitHubStatsData {
  login: string;
  name: string | null;
  profileUrl: string;
  publicRepos: number;
  followers: number;
  stars: number;
  topRepos: { name: string; url: string; stars: number; language: string | null }[];
}

type FetchLike = (input: string, init?: RequestInit & { next?: { revalidate?: number } }) => Promise<Response>;

const REVALIDATE_SECONDS = 3600;

export async function loadGitHubStats(username: string, fetchImpl: FetchLike = fetch): Promise<GitHubStatsData | null> {
  const user = encodeURIComponent(username);
  const init = {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "plinth-github-stats" },
    next: { revalidate: REVALIDATE_SECONDS },
  };
  try {
    const [profileResponse, reposResponse] = await Promise.all([
      fetchImpl(`https://api.github.com/users/${user}`, init),
      fetchImpl(`https://api.github.com/users/${user}/repos?per_page=100&type=owner&sort=updated`, init),
    ]);
    if (!profileResponse.ok || !reposResponse.ok) return null;
    const profile = (await profileResponse.json()) as { login: string; name: string | null; html_url: string; public_repos: number; followers: number };
    const repos = (await reposResponse.json()) as { name: string; html_url: string; stargazers_count: number; language: string | null; fork: boolean }[];
    const own = repos.filter((repo) => !repo.fork);
    return {
      login: profile.login,
      name: profile.name,
      profileUrl: profile.html_url,
      publicRepos: profile.public_repos,
      followers: profile.followers,
      stars: own.reduce((sum, repo) => sum + repo.stargazers_count, 0),
      topRepos: [...own]
        .sort((a, b) => b.stargazers_count - a.stargazers_count || a.name.localeCompare(b.name))
        .slice(0, 3)
        .map((repo) => ({ name: repo.name, url: repo.html_url, stars: repo.stargazers_count, language: repo.language })),
    };
  } catch {
    return null;
  }
}

export async function GitHubStats({ username, showTopRepos = true }: GitHubStatsProps) {
  const data = await loadGitHubStats(username);
  return <GitHubStatsCard username={username} data={data} showTopRepos={showTopRepos} />;
}

/** The presentation, separate from fetching so it can be rendered and tested with fixed data. */
export function GitHubStatsCard({ username, data, showTopRepos = true }: { username: string; data: GitHubStatsData | null; showTopRepos?: boolean }) {
  if (!data) {
    return (
      <section style={styles.card} aria-label="GitHub stats">
        <p style={styles.muted}>GitHub stats for {username} are unavailable right now.</p>
      </section>
    );
  }
  const numbers: [string, number][] = [
    ["Repositories", data.publicRepos],
    ["Stars", data.stars],
    ["Followers", data.followers],
  ];
  return (
    <section style={styles.card} aria-label="GitHub stats">
      <header style={styles.header}>
        <span style={styles.title}>GitHub</span>
        <a href={data.profileUrl} style={styles.link} target="_blank" rel="noopener noreferrer">
          @{data.login}
        </a>
      </header>
      <dl style={styles.grid}>
        {numbers.map(([label, value]) => (
          <div key={label}>
            <dt style={styles.muted}>{label}</dt>
            <dd style={styles.number}>{formatCount(value)}</dd>
          </div>
        ))}
      </dl>
      {showTopRepos && data.topRepos.length ? (
        <ul style={styles.list}>
          {data.topRepos.map((repo) => (
            <li key={repo.name} style={styles.repo}>
              <a href={repo.url} style={styles.link} target="_blank" rel="noopener noreferrer">
                {repo.name}
              </a>
              <span style={styles.muted}>
                {repo.language ? `${repo.language} · ` : ""}★ {formatCount(repo.stars)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  if (value >= 10_000) return `${Math.round(value / 1000)}k`;
  if (value >= 1_000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(value);
}

// Styled with the portfolio's theme variables, so the card follows its colours, radius and font.
const styles = {
  card: {
    margin: "2rem auto",
    maxWidth: "48rem",
    padding: "1.25rem 1.5rem",
    border: "1px solid var(--plinth-border, #e4e4e7)",
    borderRadius: "var(--plinth-radius, 0.75rem)",
    background: "var(--plinth-card, #fafafa)",
    color: "var(--plinth-fg, #18181b)",
    fontFamily: "var(--plinth-font, system-ui, sans-serif)",
  },
  header: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "1rem" },
  title: { fontWeight: 600 },
  link: { color: "var(--plinth-accent, #2563eb)", textDecoration: "none" },
  muted: { margin: 0, fontSize: "0.8125rem", color: "var(--plinth-muted, #71717a)" },
  grid: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "1rem", margin: "1rem 0 0" },
  number: { margin: "0.125rem 0 0", fontSize: "1.5rem", fontWeight: 600, fontVariantNumeric: "tabular-nums" },
  list: { listStyle: "none", margin: "1rem 0 0", padding: 0, display: "grid", gap: "0.5rem" },
  repo: { display: "flex", justifyContent: "space-between", gap: "1rem" },
} satisfies Record<string, CSSProperties>;
