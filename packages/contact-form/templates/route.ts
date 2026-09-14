// Added by the Plinth Contact Form integration. Plinth manages this file: it is removed when the integration is.
//
// Messages are sent with your own Resend key. The key and your inbox address are read from the server environment
// (RESEND_API_KEY, PLINTH_CONTACT_TO). They are never stored in this repository and never sent to the browser.

const LIMITS = { name: 100, email: 200, message: 5000 };
/** Submissions faster than this after the form appeared are almost always bots. */
const MIN_FILL_MS = 2_500;
const RATE_WINDOW_MS = 10 * 60_000;
const RATE_LIMIT = 5;
const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

// Best effort: per server instance, which is enough to stop a single noisy client.
const recent = new Map<string, number[]>();

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\r/g, "").trim().slice(0, max) : "";
}

function limited(ip: string): boolean {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((at) => now - at < RATE_WINDOW_MS);
  hits.push(now);
  recent.set(ip, hits);
  if (recent.size > 5_000) recent.clear();
  return hits.length > RATE_LIMIT;
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.PLINTH_CONTACT_TO;
  if (!apiKey || !to) return json({ error: "The contact form isn't set up yet." }, 503);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Please fill in the form." }, 400);
  }

  // Spam traps: a hidden field people never fill, and a minimum time on the page. Bots get a quiet success.
  const startedAt = typeof body.startedAt === "number" ? body.startedAt : 0;
  if (clean(body.website, 200) || Date.now() - startedAt < MIN_FILL_MS) return json({ ok: true });

  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (limited(ip)) return json({ error: "Too many messages. Please try again later." }, 429);

  const name = clean(body.name, LIMITS.name).replace(/\n/g, " ");
  const email = clean(body.email, LIMITS.email);
  const message = clean(body.message, LIMITS.message);
  if (!name || !message || !EMAIL.test(email)) {
    return json({ error: "Please add your name, a valid email and a message." }, 400);
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.PLINTH_CONTACT_FROM || "Portfolio contact form <onboarding@resend.dev>",
      to: [to],
      reply_to: email,
      subject: `New message from ${name}`,
      text: `${message}\n\n— ${name} <${email}>`,
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);

  if (!response?.ok) return json({ error: "Your message couldn't be sent. Please try again later." }, 502);
  return json({ ok: true });
}
