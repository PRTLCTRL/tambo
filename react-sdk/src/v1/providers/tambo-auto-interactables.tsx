"use client";

/**
 * Auto Interactables Manager
 *
 * Automatically registers generated components as interactables when
 * autoAddToInteractables is enabled in TamboConfig. Monitors stream state
 * for new component content blocks and registers them with the
 * TamboInteractableProvider.
 */

import { useEffect, useRef } from "react";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import { useTamboConfig } from "./tambo-v1-provider";
import { useStreamState } from "./tambo-v1-stream-context";
import { useTamboRegistry } from "../../providers/tambo-registry-provider";
import { getComponentFromRegistry } from "../../util/registry";

/**
 * Component that monitors stream state and automatically adds generated
 * components to the interactables list when autoAddToInteractables is enabled.
 *
 * Must be rendered inside TamboStreamProvider, TamboInteractableProvider,
 * TamboRegistryProvider, and TamboConfigContext.
 * @internal
 * @returns null - this component renders nothing
 */
export function TamboAutoInteractablesManager(): null {
  const config = useTamboConfig();
  const { addInteractableComponent } = useTamboInteractable();
  const streamState = useStreamState();
  const registry = useTamboRegistry();

  // Track which components have already been registered to avoid duplicates
  const registeredComponentIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Only run if auto-add is enabled
    if (!config.autoAddToInteractables) {
      return;
    }

    // Get the current thread
    const currentThread = streamState.threadMap[streamState.currentThreadId];
    if (!currentThread) {
      return;
    }

    // Scan all messages in the current thread for component content blocks
    for (const message of currentThread.thread.messages) {
      if (message.role !== "assistant") {
        continue;
      }

      for (const content of message.content) {
        // Only process component content blocks
        if (content.type !== "component") {
          continue;
        }

        // Skip if already registered
        if (registeredComponentIds.current.has(content.id)) {
          continue;
        }

        // Get the component metadata from the registry
        try {
          const registeredComponent = getComponentFromRegistry(
            content.name,
            registry.componentList,
          );

          // Register as interactable
          addInteractableComponent({
            name: content.name,
            description:
              registeredComponent.description ??
              `Generated component: ${content.name}`,
            component: registeredComponent.component,
            props: content.props ?? {},
            propsSchema: registeredComponent.props,
            // No state schema for auto-added components unless the original had one
            stateSchema: undefined,
          });

          // Mark as registered
          registeredComponentIds.current.add(content.id);
        } catch (error) {
          // Component not found in registry - skip
          console.warn(
            `[TamboAutoInteractables] Component ${content.name} not found in registry`,
            error,
          );
        }
      }
    }
  }, [
    config.autoAddToInteractables,
    streamState.currentThreadId,
    streamState.threadMap,
    addInteractableComponent,
    registry.componentList,
  ]);

  return null;
}
