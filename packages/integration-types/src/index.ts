import { SLOT_NAMES, SLOTS, type SlotDefinition, type SlotName } from "@plinth-pages/core/slots";
import { z } from "zod";

/**
 * `plinth.manifest.json` — what an integration package tells Plinth about itself: which component to import, where
 * it may be placed, and the props a user fills in. The catalogue ingests manifests; the install form, the prop
 * validation and the codemod all read from them. Nothing in a manifest is ever executed.
 */

export const INTEGRATION_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const COMPONENT = /^[A-Z][A-Za-z0-9]*$/;
const PACKAGE = /^(?:@[a-z0-9][a-z0-9-._]*\/)?[a-z0-9][a-z0-9-._]*$/;
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** Props an integration may not declare: React internals, and anything that can carry markup or code. */
const RESERVED_PROPS = new Set(["children", "key", "ref", "dangerouslySetInnerHTML", "style", "className"]);

export const CATEGORIES = ["coding", "social", "writing", "analytics", "contact", "other"] as const;

/** Environment variable names an integration may declare for its secrets. */
const ENV_NAME = /^[A-Z][A-Z0-9_]{2,63}$/;
/**
 * Prefixes a secret may never use: `NEXT_PUBLIC_` is compiled into the browser bundle, and the others belong to the
 * platform or the runtime.
 */
const FORBIDDEN_ENV_PREFIXES = ["NEXT_PUBLIC_", "VERCEL", "NODE_", "NEXT_", "PLINTH_INTERNAL_", "PORT", "PATH", "HOME"];

/** Providers Plinth can verify a key with before saving it. `none` means the value is checked for format only. */
export const SECRET_PROVIDERS = ["resend", "none"] as const;

export const secretSpecSchema = z.object({
  env: z
    .string()
    .regex(ENV_NAME, "Secret names are UPPER_SNAKE_CASE")
    .refine((name) => !FORBIDDEN_ENV_PREFIXES.some((prefix) => name.startsWith(prefix)), "This name would expose the secret or clash with the platform"),
  label: z.string().min(1).max(60),
  description: z.string().max(200).optional(),
  /** How the value is entered and checked. */
  kind: z.enum(["api_key", "email", "text"]).default("api_key"),
  provider: z.enum(SECRET_PROVIDERS).default("none"),
  required: z.boolean().default(true),
  placeholder: z.string().max(80).optional(),
  /** Where the user gets the value. */
  helpUrl: z.string().url().optional(),
});

/** A file the integration adds to the repository, copied from its package. Only server routes under its own folder. */
export const fileSpecSchema = z.object({
  path: z.string().regex(/^app\/api\/plinth\/[a-z0-9-]+\/(?:[a-z0-9-]+\/)*route\.ts$/, "Files may only be route.ts handlers under app/api/plinth/<id>/"),
  source: z.string().regex(/^templates\/[a-z0-9_-]+\.ts$/, "Sources live in the package's templates/ folder"),
});

/** Values Plinth fills in at install time instead of the user. */
export const INJECTED_VALUES = ["portfolioId", "publicApiUrl"] as const;

const base = {
  name: z.string().regex(IDENTIFIER, "Prop names are identifiers").refine((n) => !RESERVED_PROPS.has(n) && !/^on[A-Z]/.test(n), {
    message: "This prop name is reserved",
  }),
  label: z.string().min(1).max(60),
  description: z.string().max(200).optional(),
  required: z.boolean().default(false),
};

export const propSpecSchema = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("string"),
    default: z.string().max(200).optional(),
    placeholder: z.string().max(80).optional(),
    /** A regular expression the whole value must match. */
    pattern: z
      .string()
      .max(200)
      .refine((source) => {
        try {
          new RegExp(source, "u");
          return true;
        } catch {
          return false;
        }
      }, "Not a valid regular expression")
      .optional(),
    patternMessage: z.string().max(120).optional(),
    maxLength: z.number().int().positive().max(200).default(100),
  }),
  z.object({
    ...base,
    type: z.literal("number"),
    default: z.number().finite().optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    integer: z.boolean().default(false),
  }),
  z.object({
    ...base,
    type: z.literal("boolean"),
    default: z.boolean().optional(),
  }),
]);

export const manifestSchema = z
  .object({
    $schema: z.string().optional(),
    id: z
      .string()
      .regex(INTEGRATION_ID, "Integration ids are lowercase words joined by hyphens")
      .refine((id) => id !== "imports", '"imports" is reserved'),
    name: z.string().min(1).max(60),
    description: z.string().min(1).max(280),
    category: z.enum(CATEGORIES),
    package: z.string().regex(PACKAGE, "Not an npm package name"),
    version: z.string().regex(EXACT_VERSION, "Use an exact version, for example 1.2.0"),
    component: z.object({
      /** The named export placed in the slot. */
      import: z.string().regex(COMPONENT, "Component names start with a capital letter"),
      /** `provider` components wrap the page and may only go in the providers slot. */
      kind: z.enum(["element", "provider"]).default("element"),
    }),
    defaultSlot: z.enum(SLOT_NAMES),
    allowedSlots: z.array(z.enum(SLOT_NAMES)).min(1),
    props: z.array(propSpecSchema).max(20).default([]),
    /** Secrets the integration needs. Stored encrypted by Plinth, delivered only as server environment variables. */
    secrets: z.array(secretSpecSchema).max(5).default([]),
    /** Server files the integration adds to the repository. They read secrets from the environment, never contain them. */
    files: z.array(fileSpecSchema).max(3).default([]),
    /** Props Plinth fills in at install time, by prop name. The user never sees or edits them. */
    injected: z.record(z.string().regex(IDENTIFIER), z.enum(INJECTED_VALUES)).default({}),
    /** Portfolio roles this integration is recommended for, first in the catalogue. */
    recommendedFor: z.array(z.string()).max(10).default([]),
    homepage: z.string().url().optional(),
  })
  .superRefine((manifest, ctx) => {
    if (!manifest.allowedSlots.includes(manifest.defaultSlot)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["defaultSlot"], message: "defaultSlot must be one of allowedSlots" });
    }
    const providers = manifest.component.kind === "provider";
    manifest.allowedSlots.forEach((slot, index) => {
      if (providers !== Boolean((SLOTS[slot] as SlotDefinition).wraps)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["allowedSlots", index],
          message: providers ? "Providers can only be placed in the providers slot" : `"${slot}" only accepts providers`,
        });
      }
    });
    if (providers && manifest.props.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["props"], message: "Providers are placed by reference and can't take props" });
    }
    const names = new Set<string>();
    manifest.props.forEach((prop, index) => {
      if (names.has(prop.name)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["props", index, "name"], message: `Duplicate prop "${prop.name}"` });
      names.add(prop.name);
    });
    Object.keys(manifest.injected).forEach((name) => {
      if (names.has(name)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["injected", name], message: `"${name}" is also a user prop` });
      if (RESERVED_PROPS.has(name) || /^on[A-Z]/.test(name)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["injected", name], message: "This prop name is reserved" });
    });
    if (providers && Object.keys(manifest.injected).length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["injected"], message: "Providers are placed by reference and can't take props" });
    }
    const envs = new Set<string>();
    manifest.secrets.forEach((secret, index) => {
      if (envs.has(secret.env)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["secrets", index, "env"], message: `Duplicate secret "${secret.env}"` });
      envs.add(secret.env);
    });
    manifest.files.forEach((file, index) => {
      if (!file.path.startsWith(`app/api/plinth/${manifest.id}/`)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["files", index, "path"], message: `Files must live under app/api/plinth/${manifest.id}/` });
      }
    });
  });

export type IntegrationManifest = z.infer<typeof manifestSchema>;
export type PropSpec = z.infer<typeof propSpecSchema>;
export type SecretSpec = z.infer<typeof secretSpecSchema>;
export type FileSpec = z.infer<typeof fileSpecSchema>;
export type InjectedValue = (typeof INJECTED_VALUES)[number];
export type PropValue = string | number | boolean;
export type { SlotName };

export interface ManifestIssue {
  path: string;
  message: string;
}

export function validateManifest(raw: unknown): { ok: true; manifest: IntegrationManifest } | { ok: false; issues: ManifestIssue[] } {
  const parsed = manifestSchema.safeParse(raw);
  if (parsed.success) return { ok: true, manifest: parsed.data };
  return { ok: false, issues: parsed.error.issues.map((issue) => ({ path: issue.path.join(".") || "(root)", message: issue.message })) };
}

/**
 * Validates what a user typed into an integration's form against its manifest. Unknown props are rejected, defaults
 * are applied, strings are trimmed. The result is data only: the codemod writes each value as an escaped literal.
 */
export function propsSchemaFor(manifest: IntegrationManifest): z.ZodType<Record<string, PropValue>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const prop of manifest.props) {
    let field: z.ZodTypeAny;
    if (prop.type === "string") {
      let s = z.string().trim().max(prop.maxLength);
      if (prop.pattern) s = s.regex(new RegExp(`^(?:${prop.pattern})$`, "u"), prop.patternMessage ?? `${prop.label} isn't in the expected format`);
      field = prop.required ? s.min(1, `${prop.label} is required`) : s;
    } else if (prop.type === "number") {
      let n = z.number().finite();
      if (prop.integer) n = n.int();
      if (prop.min !== undefined) n = n.min(prop.min);
      if (prop.max !== undefined) n = n.max(prop.max);
      field = n;
    } else {
      field = z.boolean();
    }
    shape[prop.name] = prop.default !== undefined ? field.default(prop.default) : prop.required ? field : field.optional();
  }
  return z.object(shape).strict() as unknown as z.ZodType<Record<string, PropValue>>;
}
