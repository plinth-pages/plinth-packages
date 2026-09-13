import type { CSSProperties } from "react";

/**
 * LeetCode Stats — a Plinth integration. Reads LeetCode's public profile data on the server, cached for an hour.
 * LeetCode has no official public API; if the request fails the card says so and the rest of the page renders.
 */

export interface LeetCodeStatsProps {
  username: string;
}

export interface LeetCodeStatsData {
  username: string;
  ranking: number | null;
  solved: { all: number; easy: number; medium: number; hard: number };
}

type FetchLike = (input: string, init?: RequestInit & { next?: { revalidate?: number } }) => Promise<Response>;

const QUERY = `query plinthLeetCodeStats($username: String!) {
  matchedUser(username: $username) {
    username
    profile { ranking }
    submitStatsGlobal { acSubmissionNum { difficulty count } }
  }
}`;

export async function loadLeetCodeStats(username: string, fetchImpl: FetchLike = fetch): Promise<LeetCodeStatsData | null> {
  try {
    const response = await fetchImpl("https://leetcode.com/graphql/", {
      method: "POST",
      headers: { "Content-Type": "application/json", Referer: "https://leetcode.com", "User-Agent": "plinth-leetcode-stats" },
      // The username travels as a GraphQL variable, never inside the query text.
      body: JSON.stringify({ query: QUERY, variables: { username } }),
      next: { revalidate: 3600 },
    });
    if (!response.ok) return null;
    const json = (await response.json()) as {
      data?: {
        matchedUser: null | {
          username: string;
          profile: { ranking: number | null } | null;
          submitStatsGlobal: { acSubmissionNum: { difficulty: string; count: number }[] } | null;
        };
      };
    };
    const user = json.data?.matchedUser;
    if (!user) return null;
    const count = (difficulty: string) => user.submitStatsGlobal?.acSubmissionNum.find((entry) => entry.difficulty === difficulty)?.count ?? 0;
    return {
      username: user.username,
      ranking: user.profile?.ranking ?? null,
      solved: { all: count("All"), easy: count("Easy"), medium: count("Medium"), hard: count("Hard") },
    };
  } catch {
    return null;
  }
}

export async function LeetCodeStats({ username }: LeetCodeStatsProps) {
  return <LeetCodeStatsCard username={username} data={await loadLeetCodeStats(username)} />;
}

export function LeetCodeStatsCard({ username, data }: { username: string; data: LeetCodeStatsData | null }) {
  if (!data) {
    return (
      <section style={styles.card} aria-label="LeetCode stats">
        <p style={styles.muted}>LeetCode stats for {username} are unavailable right now.</p>
      </section>
    );
  }
  const levels: [string, number, string][] = [
    ["Easy", data.solved.easy, "#16a34a"],
    ["Medium", data.solved.medium, "#d97706"],
    ["Hard", data.solved.hard, "#dc2626"],
  ];
  return (
    <section style={styles.card} aria-label="LeetCode stats">
      <header style={styles.header}>
        <span style={styles.title}>LeetCode</span>
        <a href={`https://leetcode.com/u/${encodeURIComponent(data.username)}/`} style={styles.link} target="_blank" rel="noopener noreferrer">
          {data.username}
        </a>
      </header>
      <p style={styles.total}>
        {data.solved.all}
        <span style={styles.muted}> problems solved{data.ranking ? ` · ranking ${data.ranking.toLocaleString("en-US")}` : ""}</span>
      </p>
      <dl style={styles.grid}>
        {levels.map(([label, value, colour]) => (
          <div key={label}>
            <dt style={{ ...styles.muted, color: colour }}>{label}</dt>
            <dd style={styles.number}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

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
  muted: { margin: 0, fontSize: "0.8125rem", color: "var(--plinth-muted, #71717a)", fontWeight: 400 },
  total: { margin: "0.75rem 0 0", fontSize: "1.5rem", fontWeight: 600, fontVariantNumeric: "tabular-nums" },
  grid: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "1rem", margin: "1rem 0 0" },
  number: { margin: "0.125rem 0 0", fontSize: "1.125rem", fontWeight: 600, fontVariantNumeric: "tabular-nums" },
} satisfies Record<string, CSSProperties>;
