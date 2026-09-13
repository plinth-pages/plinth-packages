import type { ComponentType, ReactNode } from "react";
import { SLOTS, type SlotDefinition, type SlotName } from "./slots";

export interface SlotProps {
  name: SlotName;
  children?: ReactNode;
  /** Only for the `providers` slot: components that wrap `children`, outermost first. */
  wrap?: ComponentType<{ children?: ReactNode }>[];
}

/**
 * A locked extension point. Integrations are placed inside it by the Plinth codemod engine;
 * `plinth check` rejects any other change to its contents.
 */
export function Slot({ name, children, wrap }: SlotProps) {
  const definition: SlotDefinition = SLOTS[name];

  if (definition.wraps) {
    return <>{(wrap ?? []).reduceRight<ReactNode>((inner, Wrapper) => <Wrapper>{inner}</Wrapper>, children)}</>;
  }

  if (definition.bare) return <>{children}</>;

  // `display: contents` keeps the wrapper out of layout while giving the IDE and health checks
  // a stable DOM anchor for each slot.
  return (
    <div data-plinth-slot={name} style={{ display: "contents" }}>
      {children}
    </div>
  );
}
