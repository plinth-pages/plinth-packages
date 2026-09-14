import { validateManifest } from "@plinth-pages/integration-types";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import manifest from "../plinth.manifest.json";
import pkg from "../package.json";
import { CONTACT_ENDPOINT, ContactForm } from "../src";
import { POST } from "../templates/route";

describe("manifest", () => {
  it("is valid, matches the package, and its route matches where the form posts", () => {
    const result = validateManifest(manifest);
    expect(result.ok ? [] : result.issues).toEqual([]);
    expect(manifest.package).toBe(pkg.name);
    expect(manifest.version).toBe(pkg.version);
    expect(`/${manifest.files[0].path.replace(/^app\//, "").replace(/\/route\.ts$/, "")}`).toBe(CONTACT_ENDPOINT);
  });

  it("never names a browser-visible environment variable anywhere", () => {
    const sources = [readFileSync("src/index.tsx", "utf8"), readFileSync("templates/route.ts", "utf8")].join("\n");
    expect(sources).not.toMatch(/NEXT_PUBLIC_/);
    expect(readFileSync("src/index.tsx", "utf8")).not.toMatch(/process\.env/);
  });
});

describe("ContactForm", () => {
  it("renders the fields, a hidden spam trap, and no secrets", () => {
    const html = renderToStaticMarkup(<ContactForm heading="Say hi" />);
    expect(html).toContain("Say hi");
    expect(html).toContain('name="email"');
    expect(html).toContain('name="website"');
    expect(html).toContain('aria-hidden="true"');
  });
});

describe("route", () => {
  const send = vi.fn();
  const post = (body: unknown, ip = "1.1.1.1") =>
    POST(new Request("https://site.example/api/plinth/contact-form", { method: "POST", headers: { "x-forwarded-for": ip }, body: JSON.stringify(body) }));
  const valid = (extra: object = {}) => ({ name: "Asha", email: "asha@example.com", message: "Hello!", website: "", startedAt: Date.now() - 10_000, ...extra });

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.PLINTH_CONTACT_TO = "owner@example.com";
    send.mockReset().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", send);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
    delete process.env.PLINTH_CONTACT_TO;
  });

  it("sends through Resend with the key from the environment, replying to the visitor", async () => {
    const response = await post(valid());
    expect(response.status).toBe(200);
    const [url, init] = send.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test_key");
    expect(JSON.parse(init.body)).toMatchObject({ to: ["owner@example.com"], reply_to: "asha@example.com", subject: "New message from Asha" });
  });

  it("says it isn't set up when the secrets are missing", async () => {
    delete process.env.RESEND_API_KEY;
    expect((await post(valid())).status).toBe(503);
    expect(send).not.toHaveBeenCalled();
  });

  it("quietly drops bots: a filled trap or an instant submission", async () => {
    expect((await post(valid({ website: "spam.example" }))).status).toBe(200);
    expect((await post(valid({ startedAt: Date.now() }))).status).toBe(200);
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects invalid input and header injection", async () => {
    expect((await post(valid({ email: "not-an-email" }))).status).toBe(400);
    expect((await post(valid({ email: "a@b.co\nBcc: x@y.z" }))).status).toBe(400);
    expect((await post(valid({ message: "" }))).status).toBe(400);
    const response = await post(valid({ name: "Eve\nBcc: victim@example.com" }), "9.9.9.9");
    expect(response.status).toBe(200);
    expect(JSON.parse(send.mock.calls[0][1].body).subject).toBe("New message from Eve Bcc: victim@example.com");
  });

  it("rate-limits a single client", async () => {
    const statuses = [];
    for (let i = 0; i < 7; i++) statuses.push((await post(valid(), "5.5.5.5")).status);
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses.at(-1)).toBe(429);
  });

  it("reports a provider failure without leaking details", async () => {
    send.mockResolvedValue(new Response(JSON.stringify({ message: "API key is invalid" }), { status: 401 }));
    const response = await post(valid(), "7.7.7.7");
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("API key");
  });
});
