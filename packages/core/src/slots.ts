/**
 * The slot vocabulary — the contract every portfolio repository and every integration depends on.
 *
 * Adding a slot is a minor version. Renaming or removing one is a breaking change that needs a
 * migration codemod across every existing portfolio, because generated repos never re-sync.
 *
 * This module must stay free of React so the validator and the backend can import it.
 */

export const SLOTS_VERSION = 1;

export const SLOT_FILES = ["app/layout.tsx", "app/page.tsx"] as const;
export type SlotFile = (typeof SLOT_FILES)[number];

export interface SlotDefinition {
  file: SlotFile;
  /** Renders no wrapper element — required where a <div> would be invalid (inside <head>). */
  bare?: boolean;
  /** Integrations here wrap the page instead of rendering beside it (context providers). */
  wraps?: boolean;
  description: string;
}

export const SLOTS = {
  head: { file: "app/layout.tsx", bare: true, description: "Scripts and tags inside <head>" },
  bodyEnd: { file: "app/layout.tsx", bare: true, description: "Deferred scripts and widgets at the end of <body>" },
  providers: { file: "app/layout.tsx", bare: true, wraps: true, description: "Context providers wrapping the page" },
  heroAfter: { file: "app/page.tsx", description: "Directly below the hero" },
  beforeProjects: { file: "app/page.tsx", description: "Above the projects section" },
  afterProjects: { file: "app/page.tsx", description: "Below the projects section" },
  sidebar: { file: "app/page.tsx", description: "Compact widgets" },
  beforeContact: { file: "app/page.tsx", description: "Above the contact section" },
  contact: { file: "app/page.tsx", description: "Contact forms" },
  footer: { file: "app/page.tsx", description: "Inside the page footer" },
} as const satisfies Record<string, SlotDefinition>;

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
