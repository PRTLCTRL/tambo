"use client";

/**
 * Auto-Interactables Manager
 *
 * Internal component that automatically adds AI-generated components to the
 * interactables system when autoAddInteractables is enabled.
 *
 * This runs inside the provider tree and monitors messages for new component
 * content blocks, automatically registering them as interactables so the AI
 * can update them later.
 */

import { useEffect, useRef } from "react";
import { useTamboConfig } from "./tambo-v1-provider";
import { useStreamState } from "./tambo-v1-stream-context";
import { useTamboRegistry } from "../../providers/tambo-registry-provider";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import { getComponentFromRegistry } from "../../util/registry";
import type { TamboComponentContent } from "../types/message";

/**
 * Internal component that manages automatic addition of components to interactables.
 * Must be rendered within the provider tree to access all necessary contexts.
 * @returns null - this component renders nothing
 */
export function AutoInteractablesManager(): null {
  const config = useTamboConfig();
  const streamState = useStreamState();
  const registry = useTamboRegistry();
  const { addInteractableComponent } = useTamboInteractable();

  // Track which component IDs we've already added to interactables
  const addedComponentIdsRef = useRef(new Set<string>());

  useEffect(() => {
    // Skip if autoAddInteractables is not enabled
    if (!config.autoAddInteractables) {
      return;
    }

    // Get current thread
    const currentThread = streamState.threadMap[streamState.currentThreadId];
    if (!currentThread) {
      return;
    }

    // Scan all messages for component content blocks
    for (const message of currentThread.thread.messages) {
      for (const content of message.content) {
        // Only process component content blocks
        if (content.type !== "component") {
          continue;
        }

        const componentContent = content as TamboComponentContent;

        // Skip if we've already added this component
        if (addedComponentIdsRef.current.has(componentContent.id)) {
          continue;
        }

        // Skip if component is still streaming (wait for it to complete)
        if (
          componentContent.streamingState &&
          componentContent.streamingState !== "done"
        ) {
          continue;
        }

        // Get the registered component definition
        let registeredComponent;
        try {
          registeredComponent = getComponentFromRegistry(
            componentContent.name,
            registry.componentList,
          );
        } catch (_error) {
          // Component not found in registry - skip it
          console.warn(
            `[AutoInteractables] Component "${componentContent.name}" not found in registry, skipping`,
          );
          continue;
        }

        // Add to interactables
        try {
          const componentProps = componentContent.props ?? {};
          addInteractableComponent({
            name: componentContent.name,
            description: registeredComponent.description,
            component: registeredComponent.component,
            props: componentProps as Record<string, unknown>,
            propsSchema: registeredComponent.props,
          });

          // Mark as added
          addedComponentIdsRef.current.add(componentContent.id);
        } catch (_error) {
          console.error(
            `[AutoInteractables] Failed to add component "${componentContent.name}" to interactables:`,
            _error,
          );
        }
      }
    }
  }, [
    config.autoAddInteractables,
    streamState,
    registry.componentList,
    addInteractableComponent,
  ]);

  return null;
}
