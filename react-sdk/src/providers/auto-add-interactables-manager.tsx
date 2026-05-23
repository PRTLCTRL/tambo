"use client";

import { useEffect, useRef } from "react";
import { useStreamState } from "../v1/providers/tambo-v1-stream-context";
import { useTamboConfig } from "../v1/providers/tambo-v1-provider";
import { useTamboInteractable } from "./tambo-interactable-provider";
import { useTamboRegistry } from "./tambo-registry-provider";

/**
 * Internal manager component that automatically adds generated components
 * to the interactables list when autoAddInteractables is enabled.
 *
 * This component watches for new component content in messages and registers
 * them as interactable components automatically.
 * @returns null (renders nothing)
 */
export function AutoAddInteractablesManager(): null {
  const { autoAddInteractables } = useTamboConfig();
  const streamState = useStreamState();
  const { addInteractableComponent, interactableComponents } =
    useTamboInteractable();
  const { componentList } = useTamboRegistry();

  // Track which component IDs we've already auto-added to avoid duplicates
  const addedComponentIds = useRef(new Set<string>());

  useEffect(() => {
    // Only run if feature is enabled
    if (!autoAddInteractables) {
      return;
    }

    // Get messages from current thread
    const threadState = streamState.threadMap[streamState.currentThreadId];
    if (!threadState) {
      return;
    }

    const messages = threadState.thread.messages;

    // Find all component content blocks in messages
    for (const message of messages) {
      for (const content of message.content) {
        if (content.type !== "component") {
          continue;
        }

        const componentId = content.id;

        // Skip if we've already auto-added this component
        if (addedComponentIds.current.has(componentId)) {
          continue;
        }

        // Skip if already in interactables (manually added or from withTamboInteractable)
        const alreadyInteractable = interactableComponents.some(
          (ic) => ic.id === componentId,
        );
        if (alreadyInteractable) {
          addedComponentIds.current.add(componentId);
          continue;
        }

        // Look up component definition in registry
        const componentDef = componentList[content.name];
        if (!componentDef) {
          continue;
        }

        // Add to interactables with the original component ID
        try {
          const propsToUse = (content.props ?? {}) as Record<string, unknown>;
          const stateToUse = (content.state ?? {}) as Record<string, unknown>;

          addInteractableComponent(
            {
              name: content.name,
              description:
                componentDef.description ?? `Auto-added ${content.name}`,
              component: componentDef.component,
              props: propsToUse,
              state: stateToUse,
            },
            componentId,
          );

          addedComponentIds.current.add(componentId);
        } catch (error) {
          console.warn(
            `Failed to auto-add component ${componentId} to interactables:`,
            error,
          );
        }
      }
    }
  }, [
    autoAddInteractables,
    streamState,
    addInteractableComponent,
    interactableComponents,
    componentList,
  ]);

  return null;
}
