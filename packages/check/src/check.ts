import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { plinthJsonSchema, type PlinthJson } from "@plinth-pages/core/plinth-json";
import { SLOT_FILES, SLOT_NAMES, SLOT_SEARCH_DIRS, SLOTS, couldHoldSlots, isSlotName, type SlotFile, type SlotName } from "@plinth-pages/core/slots";
import { Node, Project, ts, type JsxElement, type JsxSelfClosingElement, type SourceFile } from "ts-morph";

export type IssueCode =
  | "PLINTH_JSON_MISSING"
  | "PLINTH_JSON_INVALID"
  | "FILE_MISSING"
  | "SLOT_MISSING"
  | "SLOT_DUPLICATE"
  | "SLOT_UNKNOWN"
  | "SLOT_WRONG_FILE"
  | "SLOT_NAME_NOT_LITERAL"
  | "SLOT_UNMANAGED_CONTENT"
  | "PROVIDERS_CHILDREN"
  | "PROVIDERS_WRAP_NOT_ARRAY"
  | "MARKER_UNPAIRED"
  | "MARKER_NESTED"
  | "MARKER_EMPTY"
  | "MARKER_MISPLACED"
  | "INTEGRATION_NOT_DECLARED"
  | "INTEGRATION_NOT_PLACED"
  | "INTEGRATION_DUPLICATE"
  | "IMPORT_REGION_MISSING"
  | "IMPORT_REGION_DUPLICATE"
  | "IMPORT_REGION_INVALID"
  | "IMPORT_OUTSIDE_REGION"
  | "IMPORT_UNDECLARED"
  | "IMPORT_MISSING";

export interface CheckIssue {
  code: IssueCode;
  file: string;
  line?: number;
  message: string;
}

export interface CheckResult {
  ok: boolean;
  issues: CheckIssue[];
}

export interface CheckInput {
  /**
   * File contents keyed by path. A missing key means the file does not exist. Any path under the slot search
   * directories may hold slots: a redesign is free to move one into a component or a new page.
   */
  files: Record<string, string>;
  /** Raw plinth.json text, or undefined when the file does not exist. */
  plinthJson: string | undefined;
}

type Report = (code: IssueCode, file: string, message: string, line?: number) => void;

/** Platform tooling in the @plinth-pages scope — never an integration. */
const PLATFORM_PACKAGES = new Set(["@plinth-pages/core", "@plinth-pages/check"]);

const MARKER = /\/\*\s*plinth:([a-z0-9]+(?:-[a-z0-9]+)*):(start|end)\b[^*]*\*\//g;
const IMPORTS_START = /\/\/\s*plinth:imports:start\b/g;
const IMPORTS_END = /\/\/\s*plinth:imports:end\b/g;

/** Validates the slot contract from in-memory sources. Pure: the safety net calls this directly. */
export function checkSources(input: CheckInput): CheckResult {
  const issues: CheckIssue[] = [];
  const report: Report = (code, file, message, line) => issues.push({ code, file, line, message });

  const manifest = readManifest(input.plinthJson, report);
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve },
  });
  const seen = new Map<SlotName, { file: string; line: number }>();

  for (const file of SLOT_FILES) {
    if (input.files[file] === undefined) report("FILE_MISSING", file, `${file} is missing.`);
  }

  // Every file that could hold a slot is scanned, so moving one into a new component is legal and still validated.
  const candidates = Object.keys(input.files).filter(couldHoldSlots).sort();
  const sources = new Map(candidates.map((file) => [file, project.createSourceFile(file, input.files[file], { overwrite: true })]));

  for (const file of candidates) {
    const source = sources.get(file)!;
    for (const element of slotElements(source)) {
      const line = element.getStartLineNumber();
      const name = literalName(element);
      if (name === undefined) {
        report("SLOT_NAME_NOT_LITERAL", file, 'A <Slot> needs a literal name, for example name="afterProjects".', line);
        continue;
      }
      if (!isSlotName(name)) {
        report("SLOT_UNKNOWN", file, `"${name}" is not a slot. Valid slots: ${SLOT_NAMES.join(", ")}.`, line);
        continue;
      }
      const previous = seen.get(name);
      if (previous) {
        report("SLOT_DUPLICATE", file, `Slot "${name}" appears more than once (first at ${previous.file}:${previous.line}).`, line);
        continue;
      }
      seen.set(name, { file, line });

      const placed = name === "providers"
        ? scanProviders(element, file, report)
        : scanChildren(element, name, file, report);

      if (manifest) {
        const expected = manifest.integrations.filter((i) => i.slot === name).map((i) => i.id);
        compare(name, expected, placed, file, line, report);
      }
    }
  }

  // Imports come after the slots are located: which packages belong in a file follows from which slots ended up there.
  for (const file of candidates) {
    const slotsHere = [...seen].filter(([, where]) => where.file === file).map(([name]) => name);
    checkImports(sources.get(file)!, file, manifest, report, slotsHere);
  }

  for (const name of SLOT_NAMES) {
    const { file, description } = SLOTS[name];
    // Reported against the file the slot started in: that is where it should be put back, wherever it went missing.
    if (!seen.has(name) && input.files[file] !== undefined) {
      report("SLOT_MISSING", file, `Slot "${name}" is missing (${description}). Every slot must appear exactly once.`);
    }
  }

  return { ok: issues.length === 0, issues };
}

/** Reads a portfolio repository from disk and validates it. */
export function checkProject(root: string): CheckResult {
  const read = (path: string) => {
    const full = join(root, path);
    return existsSync(full) ? readFileSync(full, "utf8") : undefined;
  };
  const files: Record<string, string> = {};
  for (const path of walk(root)) {
    const text = read(path);
    if (text !== undefined) files[path] = text;
  }
  return checkSources({ files, plinthJson: read("plinth.json") });
}

/**
 * Every file in the repository that could hold a slot, as repository-relative posix paths. Bounded to the slot search
 * directories, so node_modules and .next are never walked.
 */
function walk(root: string): string[] {
  const found: string[] = [...SLOT_FILES];
  const visit = (relative: string) => {
    const full = join(root, relative);
    if (!existsSync(full)) return;
    for (const entry of readdirSync(full, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const path = `${relative}/${entry.name}`;
      if (entry.isDirectory()) visit(path);
      else if (couldHoldSlots(path)) found.push(path);
    }
  };
  for (const dir of SLOT_SEARCH_DIRS) visit(dir);
  return [...new Set(found)];
}

function readManifest(text: string | undefined, report: Report): PlinthJson | undefined {
  if (text === undefined) {
    report("PLINTH_JSON_MISSING", "plinth.json", "plinth.json is missing.");
    return undefined;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    report("PLINTH_JSON_INVALID", "plinth.json", `plinth.json is not valid JSON: ${(error as Error).message}`);
    return undefined;
  }
  const parsed = plinthJsonSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      report("PLINTH_JSON_INVALID", "plinth.json", `${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
    return undefined;
  }
  return parsed.data;
}

function slotElements(source: SourceFile): (JsxElement | JsxSelfClosingElement)[] {
  return source.getDescendants().filter((node): node is JsxElement | JsxSelfClosingElement => {
    if (Node.isJsxElement(node)) return node.getOpeningElement().getTagNameNode().getText() === "Slot";
    if (Node.isJsxSelfClosingElement(node)) return node.getTagNameNode().getText() === "Slot";
    return false;
  });
}

function literalName(element: JsxElement | JsxSelfClosingElement): string | undefined {
  const owner = Node.isJsxElement(element) ? element.getOpeningElement() : element;
  const attribute = owner.getAttribute("name");
  if (!attribute || !Node.isJsxAttribute(attribute)) return undefined;
  const initializer = attribute.getInitializer();
  return initializer && Node.isStringLiteral(initializer) ? initializer.getLiteralValue() : undefined;
}

/**
 * Walks a slot's children. Anything that is not whitespace, a plain comment, or content between a
 * matched pair of integration markers is unmanaged and rejected.
 */
function scanChildren(element: JsxElement | JsxSelfClosingElement, name: SlotName, file: string, report: Report): string[] {
  if (Node.isJsxSelfClosingElement(element)) return [];

  const placed: string[] = [];
  let open: { id: string; line: number; count: number } | null = null;

  for (const child of element.getJsxChildren()) {
    const line = child.getStartLineNumber();

    if (Node.isJsxText(child)) {
      if (child.containsOnlyTriviaWhiteSpaces()) continue;
      if (open) open.count++;
      else report("SLOT_UNMANAGED_CONTENT", file, `Slot "${name}" contains text that Plinth did not place.`, line);
      continue;
    }

    if (Node.isJsxExpression(child) && child.getExpression() === undefined) {
      const markers = [...child.getText().matchAll(MARKER)];
      for (const [, id, kind] of markers) {
        if (id === "imports") {
          report("MARKER_MISPLACED", file, "The imports marker belongs at the top of the file, not inside a slot.", line);
          continue;
        }
        if (kind === "start") {
          if (open) report("MARKER_NESTED", file, `Marker for "${id}" opens inside the "${open.id}" block.`, line);
          open = { id, line, count: 0 };
        } else if (!open || open.id !== id) {
          report("MARKER_UNPAIRED", file, `End marker for "${id}" has no matching start marker.`, line);
        } else {
          if (open.count === 0) report("MARKER_EMPTY", file, `Integration block "${id}" is empty.`, open.line);
          placed.push(id);
          open = null;
        }
      }
      continue;
    }

    if (open) open.count++;
    else {
      report(
        "SLOT_UNMANAGED_CONTENT",
        file,
        `Slot "${name}" contains content that Plinth did not place. Only installed integrations may appear inside a slot.`,
        line,
      );
    }
  }

  if (open) report("MARKER_UNPAIRED", file, `Start marker for "${open.id}" is never closed.`, open.line);
  return placed;
}

/** The providers slot wraps `{children}`; its integrations are components listed in `wrap`. */
function scanProviders(element: JsxElement | JsxSelfClosingElement, file: string, report: Report): string[] {
  const line = element.getStartLineNumber();

  const meaningful = Node.isJsxElement(element)
    ? element.getJsxChildren().filter((child) => !(Node.isJsxText(child) && child.containsOnlyTriviaWhiteSpaces()))
    : [];
  const onlyChildren =
    meaningful.length === 1 &&
    Node.isJsxExpression(meaningful[0]) &&
    meaningful[0].getExpression()?.getText() === "children";
  if (!onlyChildren) {
    report("PROVIDERS_CHILDREN", file, 'The "providers" slot must contain exactly {children} and nothing else.', line);
  }

  const owner = Node.isJsxElement(element) ? element.getOpeningElement() : element;
  const wrap = owner.getAttribute("wrap");
  if (!wrap) return [];

  const initializer = Node.isJsxAttribute(wrap) ? wrap.getInitializer() : undefined;
  const array = initializer && Node.isJsxExpression(initializer) ? initializer.getExpression() : undefined;
  if (!array || !Node.isArrayLiteralExpression(array)) {
    report("PROVIDERS_WRAP_NOT_ARRAY", file, 'The "providers" slot\'s wrap prop must be an array literal.', line);
    return [];
  }

  const offset = array.getFullStart();
  const tokens = [
    ...[...array.getFullText().matchAll(MARKER)].map((match) => ({
      pos: offset + (match.index ?? 0),
      marker: { id: match[1], kind: match[2] },
    })),
    ...array.getElements().map((node) => ({ pos: node.getStart(), marker: undefined })),
  ].sort((a, b) => a.pos - b.pos);

  const placed: string[] = [];
  let open: { id: string; count: number } | null = null;
  for (const token of tokens) {
    if (!token.marker) {
      if (open) open.count++;
      else report("SLOT_UNMANAGED_CONTENT", file, 'The "providers" wrap list contains a provider Plinth did not place.', line);
      continue;
    }
    const { id, kind } = token.marker;
    if (kind === "start") {
      if (open) report("MARKER_NESTED", file, `Marker for "${id}" opens inside the "${open.id}" block.`, line);
      open = { id, count: 0 };
    } else if (!open || open.id !== id) {
      report("MARKER_UNPAIRED", file, `End marker for "${id}" has no matching start marker.`, line);
    } else {
      if (open.count !== 1) report("MARKER_EMPTY", file, `Provider block "${id}" must contain exactly one provider.`, line);
      placed.push(id);
      open = null;
    }
  }
  if (open) report("MARKER_UNPAIRED", file, `Start marker for "${open.id}" is never closed.`, line);
  return placed;
}

function compare(name: SlotName, expected: string[], placed: string[], file: string, line: number, report: Report) {
  const counts = new Map<string, number>();
  for (const id of placed) counts.set(id, (counts.get(id) ?? 0) + 1);

  for (const [id, count] of counts) {
    if (count > 1) report("INTEGRATION_DUPLICATE", file, `"${id}" is placed ${count} times in slot "${name}".`, line);
    if (!expected.includes(id)) {
      report("INTEGRATION_NOT_DECLARED", file, `"${id}" is in slot "${name}" but plinth.json does not place it there.`, line);
    }
  }
  for (const id of expected) {
    if (!counts.has(id)) {
      report("INTEGRATION_NOT_PLACED", file, `plinth.json places "${id}" in slot "${name}", but it is not in the code.`, line);
    }
  }
}

function packageRoot(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function checkImports(source: SourceFile, file: string, manifest: PlinthJson | undefined, report: Report, slotsHere: SlotName[]) {
  const text = source.getFullText();
  const starts = [...text.matchAll(IMPORTS_START)];
  const ends = [...text.matchAll(IMPORTS_END)];

  if (starts.length === 0 || ends.length === 0) {
    // The codemod writes this region the first time it puts an integration in a file, so a component that holds a
    // slot but has nothing installed in it yet is complete without one. The template's own files always have it.
    const required = SLOT_FILES.includes(file as SlotFile) || slotsHere.some((slot) => manifest?.integrations.some((i) => i.slot === slot));
    if (required) report("IMPORT_REGION_MISSING", file, "The managed imports region (// plinth:imports:start … // plinth:imports:end) is missing.");
    return;
  }
  if (starts.length > 1 || ends.length > 1) {
    report("IMPORT_REGION_DUPLICATE", file, "The managed imports region appears more than once.");
    return;
  }
  const start = starts[0].index ?? 0;
  const end = ends[0].index ?? 0;
  if (end < start) {
    report("IMPORT_REGION_INVALID", file, "The imports region ends before it starts.");
    return;
  }

  const allPackages = new Set(manifest?.integrations.map((i) => i.package) ?? []);
  const packagesHere = new Set(
    // Where the slot actually is, not where the template first put it.
    manifest?.integrations.filter((i) => slotsHere.includes(i.slot)).map((i) => i.package) ?? [],
  );
  const importedInRegion = new Set<string>();

  for (const declaration of source.getImportDeclarations()) {
    const specifier = declaration.getModuleSpecifierValue();
    const root = packageRoot(specifier);
    const position = declaration.getStart();
    const line = declaration.getStartLineNumber();
    const inRegion = position > start && position < end;
    const isIntegration =
      allPackages.has(root) || (root.startsWith("@plinth-pages/") && !PLATFORM_PACKAGES.has(root));

    if (inRegion) {
      importedInRegion.add(root);
      if (manifest && !packagesHere.has(root)) {
        report("IMPORT_UNDECLARED", file, `"${specifier}" is imported in the managed region but no integration in this file uses it.`, line);
      }
    } else if (isIntegration) {
      report("IMPORT_OUTSIDE_REGION", file, `Integration package "${specifier}" must be imported inside the managed imports region.`, line);
    }
  }

  if (manifest) {
    for (const pkg of packagesHere) {
      if (!importedInRegion.has(pkg)) {
        report("IMPORT_MISSING", file, `"${pkg}" is installed in a slot in this file but is not imported in the managed region.`);
      }
    }
  }
}
