import { useRef, useState, type CSSProperties, type FormEvent } from "react";

export interface ContactFormProps {
  heading?: string;
  buttonLabel?: string;
}

/** Where the form posts. The route is added to the portfolio when the integration is installed. */
export const CONTACT_ENDPOINT = "/api/plinth/contact-form";

type State = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

/**
 * A contact form that delivers messages to the portfolio owner's inbox through the portfolio's own server route.
 * The browser never sees an API key; it only posts the message.
 */
export function ContactForm({ heading = "Send me a message", buttonLabel = "Send message" }: ContactFormProps) {
  const startedAt = useRef(Date.now());
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setState({ kind: "sending" });
    try {
      const response = await fetch(CONTACT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          message: form.get("message"),
          website: form.get("website"),
          startedAt: startedAt.current,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Your message couldn't be sent.");
      setState({ kind: "sent" });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "Your message couldn't be sent." });
    }
  }

  if (state.kind === "sent") {
    return (
      <section style={styles.card} aria-label="Contact form">
        <p style={styles.title}>Thanks — your message is on its way.</p>
        <p style={styles.muted}>I&apos;ll get back to you soon.</p>
      </section>
    );
  }

  return (
    <section style={styles.card} aria-label="Contact form">
      <p style={styles.title}>{heading}</p>
      <form onSubmit={submit} style={styles.form}>
        <label style={styles.label}>
          Name
          <input name="name" required maxLength={100} autoComplete="name" style={styles.input} />
        </label>
        <label style={styles.label}>
          Email
          <input name="email" type="email" required maxLength={200} autoComplete="email" style={styles.input} />
        </label>
        <label style={styles.label}>
          Message
          <textarea name="message" required maxLength={5000} rows={5} style={{ ...styles.input, resize: "vertical" }} />
        </label>
        {/* Spam trap: hidden from people, tempting to bots. */}
        <label style={styles.trap} aria-hidden="true">
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
        {state.kind === "error" ? (
          <p role="alert" style={styles.error}>
            {state.message}
          </p>
        ) : null}
        <button type="submit" disabled={state.kind === "sending"} style={styles.button}>
          {state.kind === "sending" ? "Sending…" : buttonLabel}
        </button>
      </form>
    </section>
  );
}

const styles = {
  card: {
    display: "grid",
    gap: "0.75rem",
    padding: "1.25rem",
    border: "1px solid var(--plinth-border, #e4e4e7)",
    borderRadius: "var(--plinth-radius, 0.75rem)",
    background: "var(--plinth-card, #fafafa)",
    color: "var(--plinth-fg, #18181b)",
    fontFamily: "var(--plinth-font, system-ui, sans-serif)",
  },
  title: { margin: 0, fontWeight: 600, fontSize: "1.05rem" },
  muted: { margin: 0, color: "var(--plinth-muted, #71717a)", fontSize: "0.9rem" },
  form: { display: "grid", gap: "0.75rem" },
  label: { display: "grid", gap: "0.35rem", fontSize: "0.85rem", color: "var(--plinth-muted, #71717a)" },
  input: {
    font: "inherit",
    fontSize: "0.95rem",
    color: "var(--plinth-fg, #18181b)",
    background: "var(--plinth-bg, #ffffff)",
    border: "1px solid var(--plinth-border, #e4e4e7)",
    borderRadius: "calc(var(--plinth-radius, 0.75rem) * 0.6)",
    padding: "0.6rem 0.75rem",
  },
  trap: { position: "absolute", left: "-10000px", width: "1px", height: "1px", overflow: "hidden" },
  error: { margin: 0, color: "#b91c1c", fontSize: "0.85rem" },
  button: {
    justifySelf: "start",
    font: "inherit",
    fontWeight: 600,
    fontSize: "0.9rem",
    cursor: "pointer",
    border: "none",
    borderRadius: "calc(var(--plinth-radius, 0.75rem) * 0.6)",
    padding: "0.6rem 1.1rem",
    background: "var(--plinth-accent, #2563eb)",
    color: "var(--plinth-accent-fg, #ffffff)",
  },
} satisfies Record<string, CSSProperties>;
