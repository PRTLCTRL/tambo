"use client";

import { useEffect, useRef } from "react";
import { useTamboConfig } from "../v1/providers/tambo-v1-provider";
import { useStreamState } from "../v1/providers/tambo-v1-stream-context";
import { useTamboInteractable } from "./tambo-interactable-provider";
import { useTamboRegistry } from "./tambo-registry-provider";
import type { TamboComponentContent } from "../v1/types/message";

/**
 * Internal component that automatically adds generated components to interactables
 * when autoAddComponentsToInteractables is enabled.
 *
 * Monitors messages in the current thread and adds any component content blocks
 * to the interactables list. Components are only added once (tracked by component ID).
 *
 * @internal
 * @returns null - this component renders nothing
 */
export function TamboInteractableAutoSync(): null {
  const { autoAddComponentsToInteractables } = useTamboConfig();
  const streamState = useStreamState();
  const { addInteractableComponent } = useTamboInteractable();
  const { componentList } = useTamboRegistry();

  // Track which component IDs we've already added to avoid duplicates
  const addedComponentIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!autoAddComponentsToInteractables) {
      return;
    }

    const threadState = streamState.threadMap[streamState.currentThreadId];
    if (!threadState) {
      return;
    }

    const messages = threadState.thread.messages;

    for (const message of messages) {
      for (const content of message.content) {
        if (content.type !== "component") {
          continue;
        }

        const componentContent = content as TamboComponentContent;

        if (addedComponentIdsRef.current.has(componentContent.id)) {
          continue;
        }

        const componentMetadata = componentList.get(componentContent.name);
        if (!componentMetadata) {
          console.warn(
            `[TamboInteractableAutoSync] Component ${componentContent.name} not found in registry. Cannot add to interactables.`,
          );
          continue;
        }

        try {
          addInteractableComponent({
            name: componentContent.name,
            props: componentContent.props ?? {},
            propsSchema: componentMetadata.propsSchema,
            state: {},
          });

          addedComponentIdsRef.current.add(componentContent.id);
        } catch (error) {
          console.error(
            `[TamboInteractableAutoSync] Failed to add component ${componentContent.name} to interactables:`,
            error,
          );
        }
      }
    }
  }, [
    autoAddComponentsToInteractables,
    streamState,
    addInteractableComponent,
    componentList,
  ]);

  return null;
}
