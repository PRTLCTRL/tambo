"use client";

/**
 * Auto Interactable Manager
 *
 * Internal component that automatically adds generated components to the
 * interactables registry when autoAddInteractables is enabled.
 *
 * Monitors messages for component content blocks and registers them as
 * interactable components, allowing the AI to update them later.
 */

import { useCallback, useEffect, useRef } from "react";
import { useTamboRegistry } from "../../providers/tambo-registry-provider";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import { useTamboConfig } from "./tambo-v1-provider";
import { useStreamState } from "./tambo-v1-stream-context";
import { getComponentFromRegistry } from "../../util/registry";

/**
 * Internal component that watches messages and auto-adds components to interactables.
 * Must be used within TamboStreamProvider, TamboRegistryProvider, TamboInteractableProvider, and TamboConfigContext.
 * @internal
 * @returns null - this component renders nothing
 */
export function AutoInteractableManager(): null {
  const config = useTamboConfig();
  const state = useStreamState();
  const registry = useTamboRegistry();
  const { addInteractableComponent, getInteractableComponentsByName } =
    useTamboInteractable();

  // Track which component IDs we've already added to avoid duplicates
  const addedComponentIds = useRef(new Set<string>());

  const processComponentContent = useCallback(
    (componentId: string, componentName: string, props: Record<string, unknown>) => {
      // Skip if already added
      if (addedComponentIds.current.has(componentId)) {
        return;
      }

      try {
        // Get component metadata from registry
        const registeredComponent = getComponentFromRegistry(
          componentName,
          registry.componentList,
        );

        // Add to interactables
        const interactableId = addInteractableComponent({
          name: componentName,
          description: registeredComponent.description,
          component: registeredComponent.component,
          props,
          propsSchema: registeredComponent.props,
        });

        // Mark as added
        addedComponentIds.current.add(componentId);

        console.debug(
          `[AutoInteractableManager] Auto-added component ${componentName} (${componentId}) as interactable ${interactableId}`,
        );
      } catch (error) {
        console.warn(
          `[AutoInteractableManager] Failed to auto-add component ${componentName}:`,
          error,
        );
      }
    },
    [addInteractableComponent, registry.componentList],
  );

  // Watch for new messages with components
  useEffect(() => {
    if (!config.autoAddInteractables) {
      return;
    }

    const currentThread = state.threadMap[state.currentThreadId];
    if (!currentThread) {
      return;
    }

    // Process all messages in the current thread
    for (const message of currentThread.thread.messages) {
      // Only process assistant messages
      if (message.role !== "assistant") {
        continue;
      }

      // Find component content blocks
      for (const content of message.content) {
        if (content.type === "component") {
          processComponentContent(
            content.id,
            content.name,
            content.props ?? {},
          );
        }
      }
    }
  }, [
    config.autoAddInteractables,
    state.currentThreadId,
    state.threadMap,
    processComponentContent,
  ]);

  return null;
}
