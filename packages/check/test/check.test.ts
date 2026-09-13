import { describe, expect, it } from "vitest";
import { checkSources, type CheckInput, type IssueCode } from "../src/check";

const layout = `import { Slot } from "@plinth-pages/core";
// plinth:imports:start
// plinth:imports:end

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <Slot name="head"></Slot>
      </head>
      <body className="bg-white text-zinc-900">
        <Slot name="providers" wrap={[]}>
          {children}
        </Slot>
        <Slot name="bodyEnd"></Slot>
      </body>
    </html>
  );
}
`;

const page = `import { Slot } from "@plinth-pages/core";
// plinth:imports:start
// plinth:imports:end
import { Hero } from "@/components/sections/Hero";

export default function Page() {
  return (
    <main className="mx-auto max-w-3xl px-6">
      <Hero />
      <Slot name="heroAfter"></Slot>
      <Slot name="beforeProjects"></Slot>
      <section className="py-12">Projects</section>
      <Slot name="afterProjects"></Slot>
      <Slot name="sidebar"></Slot>
      <Slot name="beforeContact"></Slot>
      <Slot name="contact"></Slot>
      <footer className="py-8">
        <Slot name="footer"></Slot>
      </footer>
    </main>
  );
}
`;

const emptyManifest = JSON.stringify({ coreVersion: "0.1.0", slotsVersion: 1, integrations: [] });

const leetcodeManifest = JSON.stringify({
  coreVersion: "0.1.0",
  slotsVersion: 1,
  integrations: [
    { id: "leetcode-stats", package: "@plinth-pages/leetcode-stats", version: "1.2.0", slot: "afterProjects", props: { username: "asha" } },
  ],
});

const withLeetcode = page
  .replace(
    "// plinth:imports:start\n",
    '// plinth:imports:start\nimport { LeetCodeStats } from "@plinth-pages/leetcode-stats";\n',
  )
  .replace(
    '<Slot name="afterProjects"></Slot>',
    `<Slot name="afterProjects">
        {/* plinth:leetcode-stats:start */}
        <LeetCodeStats username="asha" />
        {/* plinth:leetcode-stats:end */}
      </Slot>`,
  );

function run(overrides: { layout?: string; page?: string; plinthJson?: string | undefined }) {
  const input: CheckInput = {
    files: { "app/layout.tsx": overrides.layout ?? layout, "app/page.tsx": overrides.page ?? page },
    plinthJson: "plinthJson" in overrides ? overrides.plinthJson : emptyManifest,
  };
  return checkSources(input);
}

const codes = (result: ReturnType<typeof run>): IssueCode[] => result.issues.map((issue) => issue.code);

describe("the pristine template", () => {
  it("passes", () => {
    const result = run({});
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("still passes after Tailwind and layout edits outside every slot", () => {
    const restyled = page
      .replace("mx-auto max-w-3xl px-6", "mx-auto max-w-5xl bg-zinc-950 px-10 text-white")
      .replace('<section className="py-12">Projects</section>', '<section className="grid gap-8 py-24 md:grid-cols-2"><h2>Work</h2></section>');
    expect(run({ page: restyled }).ok).toBe(true);
  });
});

describe("slot integrity", () => {
  it("rejects a deleted slot, naming it", () => {
    const result = run({ page: page.replace('<Slot name="afterProjects"></Slot>', "") });
    expect(codes(result)).toEqual(["SLOT_MISSING"]);
    expect(result.issues[0].message).toContain('"afterProjects"');
  });

  it("rejects a duplicated slot", () => {
    const result = run({ page: page.replace('<Slot name="sidebar"></Slot>', '<Slot name="sidebar"></Slot><Slot name="sidebar"></Slot>') });
    expect(codes(result)).toEqual(["SLOT_DUPLICATE"]);
  });

  it("rejects content placed inside a slot that plinth.json does not record", () => {
    const result = run({ page: page.replace('<Slot name="heroAfter"></Slot>', '<Slot name="heroAfter"><div className="p-4">Hi</div></Slot>') });
    expect(codes(result)).toEqual(["SLOT_UNMANAGED_CONTENT"]);
  });

  it("rejects stray text inside a slot", () => {
    expect(codes(run({ page: page.replace('<Slot name="contact"></Slot>', '<Slot name="contact">hello</Slot>') }))).toEqual([
      "SLOT_UNMANAGED_CONTENT",
    ]);
  });

  it("rejects a slot with a computed name", () => {
    const result = run({ page: page.replace('<Slot name="sidebar"></Slot>', "<Slot name={dynamicName}></Slot>") });
    expect(codes(result)).toEqual(expect.arrayContaining(["SLOT_NAME_NOT_LITERAL", "SLOT_MISSING"]));
  });

  it("rejects an unknown slot name", () => {
    expect(codes(run({ page: page.replace("</main>", '<Slot name="banner"></Slot></main>') }))).toEqual(["SLOT_UNKNOWN"]);
  });

  it("rejects a slot moved into the wrong file", () => {
    const result = run({
      page: page.replace('<Slot name="sidebar"></Slot>', ""),
      layout: layout.replace('<Slot name="bodyEnd"></Slot>', '<Slot name="bodyEnd"></Slot><Slot name="sidebar"></Slot>'),
    });
    expect(codes(result)).toEqual(["SLOT_WRONG_FILE"]);
  });

  it("accepts plain comments inside a slot", () => {
    expect(run({ page: page.replace('<Slot name="footer"></Slot>', '<Slot name="footer">{/* reserved for badges */}</Slot>') }).ok).toBe(true);
  });
});

describe("installed integrations", () => {
  it("passes when code, imports and plinth.json agree", () => {
    const result = run({ page: withLeetcode, plinthJson: leetcodeManifest });
    expect(result.issues).toEqual([]);
  });

  it("rejects an integration in the code that plinth.json does not record", () => {
    expect(codes(run({ page: withLeetcode }))).toEqual(expect.arrayContaining(["INTEGRATION_NOT_DECLARED", "IMPORT_UNDECLARED"]));
  });

  it("rejects an integration plinth.json records but the code lacks", () => {
    expect(codes(run({ plinthJson: leetcodeManifest }))).toEqual(expect.arrayContaining(["INTEGRATION_NOT_PLACED", "IMPORT_MISSING"]));
  });

  it("rejects an integration import moved outside the managed region", () => {
    const moved = withLeetcode
      .replace('import { LeetCodeStats } from "@plinth-pages/leetcode-stats";\n', "")
      .replace('import { Hero }', 'import { LeetCodeStats } from "@plinth-pages/leetcode-stats";\nimport { Hero }');
    expect(codes(run({ page: moved, plinthJson: leetcodeManifest }))).toEqual(
      expect.arrayContaining(["IMPORT_OUTSIDE_REGION", "IMPORT_MISSING"]),
    );
  });

  it("rejects an unpaired marker", () => {
    const broken = withLeetcode.replace("{/* plinth:leetcode-stats:end */}", "");
    expect(codes(run({ page: broken, plinthJson: leetcodeManifest }))).toContain("MARKER_UNPAIRED");
  });

  it("rejects an empty integration block", () => {
    const empty = withLeetcode.replace('<LeetCodeStats username="asha" />', "");
    expect(codes(run({ page: empty, plinthJson: leetcodeManifest }))).toContain("MARKER_EMPTY");
  });
});

describe("the providers slot", () => {
  const providersManifest = JSON.stringify({
    coreVersion: "0.1.0",
    slotsVersion: 1,
    integrations: [{ id: "theme-provider", package: "@plinth-pages/theme-provider", version: "1.0.0", slot: "providers" }],
  });
  const withProvider = layout
    .replace("// plinth:imports:start\n", '// plinth:imports:start\nimport { ThemeProvider } from "@plinth-pages/theme-provider";\n')
    .replace("wrap={[]}", "wrap={[/* plinth:theme-provider:start */ ThemeProvider /* plinth:theme-provider:end */]}");

  it("accepts a declared provider in the wrap list", () => {
    expect(run({ layout: withProvider, plinthJson: providersManifest }).issues).toEqual([]);
  });

  it("rejects an undeclared provider in the wrap list", () => {
    expect(codes(run({ layout: layout.replace("wrap={[]}", "wrap={[SomeProvider]}") }))).toEqual(["SLOT_UNMANAGED_CONTENT"]);
  });

  it("rejects anything but {children} inside providers", () => {
    expect(codes(run({ layout: layout.replace("{children}", "{children}<div />") }))).toEqual(["PROVIDERS_CHILDREN"]);
  });
});

describe("plinth.json and the imports region", () => {
  it("reports a missing plinth.json", () => {
    expect(codes(run({ plinthJson: undefined }))).toEqual(["PLINTH_JSON_MISSING"]);
  });

  it("reports malformed JSON", () => {
    expect(codes(run({ plinthJson: "{ nope" }))).toEqual(["PLINTH_JSON_INVALID"]);
  });

  it("reports an integration placed in a slot that does not exist", () => {
    const bad = JSON.stringify({
      coreVersion: "0.1.0",
      slotsVersion: 1,
      integrations: [{ id: "x", package: "@plinth-pages/x", version: "1.0.0", slot: "banner" }],
    });
    expect(codes(run({ plinthJson: bad }))).toEqual(["PLINTH_JSON_INVALID"]);
  });

  it("reserves the id 'imports'", () => {
    const bad = JSON.stringify({
      coreVersion: "0.1.0",
      slotsVersion: 1,
      integrations: [{ id: "imports", package: "@plinth-pages/x", version: "1.0.0", slot: "footer" }],
    });
    expect(codes(run({ plinthJson: bad }))).toEqual(["PLINTH_JSON_INVALID"]);
  });

  it("reports a missing imports region", () => {
    expect(codes(run({ page: page.replace("// plinth:imports:start\n// plinth:imports:end\n", "") }))).toEqual([
      "IMPORT_REGION_MISSING",
    ]);
  });
});
