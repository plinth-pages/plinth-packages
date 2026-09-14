import { useEffect, useState, type CSSProperties } from "react";

export interface VisitorCounterProps {
  /** Filled in by Plinth at install time. */
  siteId: string;
  /** Filled in by Plinth at install time: the Plinth API that stores the count. */
  endpoint: string;
  label?: string;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Counts one visit per browser session and returns the total, or null when the counter can't be reached. This is the
 * one integration that depends on a Plinth service; the portfolio renders the same without it.
 */
export async function loadVisitorCount(siteId: string, endpoint: string, fetchImpl: typeof fetch = fetch, storage: StorageLike | null = null): Promise<number | null> {
  const key = `plinth-visit:${siteId}`;
  let counted = false;
  try {
    counted = storage?.getItem(key) === "1";
  } catch {
    // Storage can be blocked; count again rather than fail.
  }
  try {
    const response = await fetchImpl(`${endpoint.replace(/\/+$/, "")}/v1/public/counter/${encodeURIComponent(siteId)}`, {
      method: counted ? "GET" : "POST",
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { count?: unknown };
    if (typeof body.count !== "number" || !Number.isFinite(body.count)) return null;
    try {
      storage?.setItem(key, "1");
    } catch {
      // ignore
    }
    return body.count;
  } catch {
    return null;
  }
}

export function formatVisitors(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (count >= 10_000) return `${Math.round(count / 1000)}k`;
  return count.toLocaleString("en-US");
}

export function VisitorCounter({ siteId, endpoint, label = "visitors" }: VisitorCounterProps) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const storage = typeof window === "undefined" ? null : window.sessionStorage;
    void loadVisitorCount(siteId, endpoint, fetch, storage).then((value) => active && setCount(value));
    return () => {
      active = false;
    };
  }, [siteId, endpoint]);

  // Nothing at all until there's a real number: no spinner, no error, no layout for a service that may be down.
  if (count === null) return null;
  return (
    <p style={styles.counter} aria-label={`${count} ${label}`}>
      <span style={styles.number}>{formatVisitors(count)}</span> {label}
    </p>
  );
}

const styles = {
  counter: { margin: 0, fontFamily: "var(--plinth-font, system-ui, sans-serif)", fontSize: "0.85rem", color: "var(--plinth-muted, #71717a)" },
  number: { fontWeight: 600, color: "var(--plinth-fg, #18181b)", fontVariantNumeric: "tabular-nums" },
} satisfies Record<string, CSSProperties>;
