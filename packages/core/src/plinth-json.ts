import { z } from "zod";
import { SLOT_NAMES, SLOTS_VERSION } from "./slots";

export const INTEGRATION_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const propValue = z.union([z.string(), z.number(), z.boolean()]);

export const installedIntegrationSchema = z.object({
  id: z
    .string()
    .regex(INTEGRATION_ID, "Integration ids are lowercase words joined by hyphens")
    .refine((id) => id !== "imports", '"imports" is reserved for the managed imports region'),
  package: z.string().min(1),
  version: z.string().min(1),
  slot: z.enum(SLOT_NAMES),
  /** Literal values only. Props are data written by the codemod, never code. */
  props: z.record(propValue).default({}),
});

/**
 * `plinth.json` — machine-owned. Records what the codemod engine has placed in each slot, so the
 * validator can tell a legitimate integration from anything else inside a slot.
 */
export const plinthJsonSchema = z
  .object({
    $schema: z.string().optional(),
    coreVersion: z.string().min(1),
    slotsVersion: z.number().int().positive().max(SLOTS_VERSION, {
      message: `slotsVersion is newer than this @plinth-pages/core supports (${SLOTS_VERSION})`,
    }),
    integrations: z.array(installedIntegrationSchema),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.integrations.forEach((integration, index) => {
      if (seen.has(integration.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["integrations", index, "id"],
          message: `Integration "${integration.id}" is listed more than once`,
        });
      }
      seen.add(integration.id);
    });
  });

export type PlinthJson = z.infer<typeof plinthJsonSchema>;
export type InstalledIntegration = z.infer<typeof installedIntegrationSchema>;
