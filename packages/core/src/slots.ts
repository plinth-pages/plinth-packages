/**
 * The slot vocabulary — the contract every portfolio repository and every integration depends on.
 *
 * Adding a slot is a minor version. Renaming or removing one is a breaking change that needs a
 * migration codemod across every existing portfolio, because generated repos never re-sync.
 *
 * This module must stay free of React so the validator and the backend can import it.
 */

export const SLOTS_VERSION = 1;

/**
 * Where a slot starts life in the template. It is an origin, not an address: Plinth AI may move a slot into a new
 * component or a new page while redesigning, and an integration must still find it. Everything that looks for a slot
 * searches `SLOT_SEARCH_DIRS` and uses this only to decide where to put a slot that is missing entirely.
 */
export const SLOT_FILES = ["app/layout.tsx", "app/page.tsx"] as const;
export type SlotFile = (typeof SLOT_FILES)[number];

/** Directories a portfolio may legitimately keep slots in. Anything else is not the user's own code. */
export const SLOT_SEARCH_DIRS = ["app", "components"] as const;

/** One definition of "this line is the tag for that slot", so the finder and the editor can never drift apart. */
export function slotTagRegex(slot: string): RegExp {
  return new RegExp(`<Slot\\s[^>]*name=["']${slot}["']`);
}

/** True for any file that could hold a slot, so callers don't each invent their own filter. */
export function couldHoldSlots(path: string): boolean {
  return SLOT_SEARCH_DIRS.some((dir) => path.startsWith(`${dir}/`)) && /\.(tsx|jsx)$/.test(path);
}

/**
 * The file a slot actually lives in, by looking. Returns null when no file has it — which is what a portfolio
 * generated before the slot existed looks like, and is the signal to add it rather than an error.
 */
export function findSlotFile(files: Record<string, string>, slot: string): string | null {
  const tag = slotTagRegex(slot);
  const candidates = Object.keys(files).filter(couldHoldSlots).sort();
  // The template's own location wins when several files match, so a copied-out component can't capture the slot.
  const origin = SLOTS[slot as SlotName]?.file;
  if (origin && files[origin] !== undefined && tag.test(files[origin])) return origin;
  return candidates.find((path) => tag.test(files[path])) ?? null;
}

export interface SlotDefinition {
  /** Where the template puts it. Use `findSlotFile` to learn where it is now. */
  file: SlotFile;
  /**
   * The SLOTS_VERSION this slot was introduced in. A portfolio records the version it was generated against, so
   * anything newer than that is a slot its repository legitimately predates — and can be added to it.
   */
  since: number;
  /**
   * The slot to put this one after when adding it to a portfolio that predates it. A neighbouring slot survives a
   * redesign in a way that markup does not: a page rebuilt from scratch still has its other slots, wherever they
   * went. Without one, the slot can only be added to a portfolio whose file still looks like the template's.
   *
   * A slot name. Not typed as `SlotName`, which is derived from SLOTS and would make this definition circular;
   * `isSlotName` narrows it at the point of use, and a test holds every value to a real slot.
   */
  after?: string;
  /** Renders no wrapper element — required where a <div> would be invalid (inside <head>). */
  bare?: boolean;
  /** Integrations here wrap the page instead of rendering beside it (context providers). */
  wraps?: boolean;
  description: string;
}

export const SLOTS = {
  head: { file: "app/layout.tsx", bare: true, since: 1, description: "Scripts and tags inside <head>" },
  bodyEnd: { file: "app/layout.tsx", bare: true, since: 1, after: "providers", description: "Deferred scripts and widgets at the end of <body>" },
  providers: { file: "app/layout.tsx", bare: true, wraps: true, since: 1, description: "Context providers wrapping the page" },
  heroAfter: { file: "app/page.tsx", since: 1, description: "Directly below the hero" },
  beforeProjects: { file: "app/page.tsx", since: 1, after: "heroAfter", description: "Above the projects section" },
  afterProjects: { file: "app/page.tsx", since: 1, after: "beforeProjects", description: "Below the projects section" },
  sidebar: { file: "app/page.tsx", since: 1, after: "afterProjects", description: "Compact widgets" },
  beforeContact: { file: "app/page.tsx", since: 1, after: "sidebar", description: "Above the contact section" },
  contact: { file: "app/page.tsx", since: 1, after: "beforeContact", description: "Contact forms" },
  footer: { file: "app/page.tsx", since: 1, after: "contact", description: "Inside the page footer" },
} as const satisfies Record<string, SlotDefinition>;

/**
 * Slots a portfolio generated at `slotsVersion` does not know about. Everything newer than the version it records is
 * missing because the repository predates it, not because anything went wrong — generated repos never re-sync.
 */
export function slotsAddedSince(slotsVersion: number): SlotName[] {
  return SLOT_NAMES.filter((name) => SLOTS[name].since > slotsVersion);
}

export type SlotName = keyof typeof SLOTS;

export const SLOT_NAMES = Object.keys(SLOTS) as [SlotName, ...SlotName[]];

export function isSlotName(value: string): value is SlotName {
  return Object.prototype.hasOwnProperty.call(SLOTS, value);
}

/** Region markers the codemod engine owns. The validator enforces them; nothing else may edit inside. */
export const MARKERS = {
  importsStart: "plinth:imports:start",
  importsEnd: "plinth:imports:end",
  integrationStart: (id: string) => `plinth:${id}:start`,
  integrationEnd: (id: string) => `plinth:${id}:end`,
} as const;
