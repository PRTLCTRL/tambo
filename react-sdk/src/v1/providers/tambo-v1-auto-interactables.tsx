"use client";

/**
 * Auto Interactables Manager
 *
 * Automatically adds generated components to the interactables list when autoInteractables is enabled.
 */

import { useEffect, useRef } from "react";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import { useTamboRegistry } from "../../providers/tambo-registry-provider";
import { useStreamState } from "./tambo-v1-stream-context";
import { useTamboConfig } from "./tambo-v1-provider";
import type { TamboComponentContent } from "../types/message";

/**
 * Internal component that watches for new component content and automatically
 * registers them as interactables when autoInteractables is enabled.
 * Must be used within TamboStreamProvider, TamboInteractableProvider, and TamboRegistryProvider.
 * @internal
 * @returns null - this component renders nothing
 */
export function TamboAutoInteractablesManager(): null {
  const { autoInteractables } = useTamboConfig();
  const streamState = useStreamState();
  const { addInteractableComponent } = useTamboInteractable();
  const { componentList } = useTamboRegistry();
  
  // Track which component content blocks we've already processed
  const processedComponentIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Only run if autoInteractables is enabled
    if (!autoInteractables) return;

    // Scan all thread messages for component content blocks
    for (const threadState of Object.values(streamState.threadMap)) {
      for (const message of threadState.thread.messages) {
        if (message.role !== "assistant") continue;

        for (const contentBlock of message.content) {
          if (contentBlock.type !== "component") continue;

          const component = contentBlock as TamboComponentContent;
          
          // Skip if we've already processed this component
          if (processedComponentIdsRef.current.has(component.id)) continue;

          // Skip if component is still streaming (not done yet)
          if (component.streamingState !== "done") continue;

          // Get the component registration from the registry
          const registration = componentList[component.name];
          if (!registration) {
            console.warn(
              `[TamboAutoInteractables] Component ${component.name} not found in registry, skipping auto-interactable registration`,
            );
            processedComponentIdsRef.current.add(component.id);
            continue;
          }

          // Add to interactables
          addInteractableComponent({
            name: component.name,
            description: registration.description,
            component: registration.component,
            props: component.props,
            propsSchema: registration.propsSchema,
            state: component.state,
          });

          // Mark as processed
          processedComponentIdsRef.current.add(component.id);
        }
      }
    }
  }, [autoInteractables, streamState, addInteractableComponent, componentList]);

  return null;
}
