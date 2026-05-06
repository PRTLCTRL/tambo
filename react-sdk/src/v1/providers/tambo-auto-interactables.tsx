"use client";

/**
 * Auto Interactables Manager
 *
 * When enabled via TamboProvider's autoInteractables prop, this component
 * automatically adds all AI-generated components to the interactables list,
 * allowing them to be updated by future AI messages.
 */

import { useEffect, useRef } from "react";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import { useTamboRegistry } from "../../providers/tambo-registry-provider";
import { useStreamState } from "./tambo-v1-stream-context";
import { useTamboConfig } from "./tambo-v1-provider";
import type { TamboComponentContent } from "../types/message";

/**
 * Internal component that automatically registers AI-generated components as interactables.
 * Only active when autoInteractables is enabled in TamboProvider.
 * @returns null - this component renders nothing
 * @internal
 */
export function TamboAutoInteractablesManager(): null {
  const { autoInteractables } = useTamboConfig();
  const { addInteractableComponent } = useTamboInteractable();
  const { getComponent } = useTamboRegistry();
  const streamState = useStreamState();

  // Track which component IDs have already been registered
  const registeredComponentsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!autoInteractables) return;

    // Get the current thread state
    const currentThreadId = streamState.currentThreadId;
    const threadState = streamState.threadMap[currentThreadId];
    if (!threadState) return;

    // Scan all messages for component content blocks
    for (const message of threadState.thread.messages) {
      if (message.role !== "assistant") continue;

      for (const contentBlock of message.content) {
        if (contentBlock.type !== "component") continue;

        const componentContent = contentBlock as TamboComponentContent;
        const componentId = componentContent.id;

        // Skip if already registered
        if (registeredComponentsRef.current.has(componentId)) continue;

        // Find the registered component definition
        const componentDef = getComponent(componentContent.name);
        if (!componentDef) {
          console.warn(
            `[autoInteractables] Component "${componentContent.name}" not found in registry, skipping`,
          );
          continue;
        }

        // Register as interactable
        try {
          addInteractableComponent({
            name: componentContent.name,
            description: componentDef.description,
            component: componentDef.component,
            props: componentContent.props ?? {},
            propsSchema: componentDef.propsSchema,
            state: componentContent.state,
            annotations: componentDef.annotations,
          });

          registeredComponentsRef.current.add(componentId);
        } catch (error) {
          console.error(
            `[autoInteractables] Failed to register component ${componentId}:`,
            error,
          );
        }
      }
    }
  }, [autoInteractables, streamState, addInteractableComponent, getComponent]);

  return null;
}
