"use client";

/**
 * Auto Interactables Manager
 *
 * Automatically registers generated components as interactables when enabled.
 * Monitors stream state for new component content blocks and adds them to the
 * interactable registry with their component metadata from the registry.
 */

import { useEffect, useRef } from "react";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import { useTamboRegistry } from "../../providers/tambo-registry-provider";
import { getComponentFromRegistry } from "../../util/registry";
import { useStreamState } from "./tambo-v1-stream-context";
import { useTamboConfig } from "./tambo-v1-provider";
import type { TamboComponentContent } from "../types/message";

/**
 * Internal component that automatically registers generated components as interactables.
 * Must be used within TamboStreamProvider, TamboInteractableProvider, TamboRegistryProvider, and TamboConfigContext.
 * @internal
 * @returns null - this component renders nothing
 */
export function AutoInteractablesManager(): null {
  const { autoAddComponentsToInteractables } = useTamboConfig();
  const streamState = useStreamState();
  const { addInteractableComponent, getInteractableComponent } =
    useTamboInteractable();
  const registry = useTamboRegistry();
  const processedComponentsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!autoAddComponentsToInteractables) {
      return;
    }

    // Get all component content blocks from all messages in the current thread
    const threadState =
      streamState.threadMap[streamState.currentThreadId]?.thread;
    if (!threadState) {
      return;
    }

    const componentBlocks: TamboComponentContent[] = [];
    for (const message of threadState.messages) {
      if (message.role !== "assistant") {
        continue;
      }
      for (const content of message.content) {
        if (content.type === "component") {
          componentBlocks.push(content);
        }
      }
    }

    // Process each component block
    for (const componentBlock of componentBlocks) {
      const componentId = componentBlock.id;

      // Skip if already processed
      if (processedComponentsRef.current.has(componentId)) {
        continue;
      }

      // Skip if already registered as interactable
      const existing = getInteractableComponent(componentId);
      if (existing) {
        processedComponentsRef.current.add(componentId);
        continue;
      }

      // Get component metadata from registry
      try {
        const registeredComponent = getComponentFromRegistry(
          componentBlock.name,
          registry.componentList,
        );

        // Register as interactable with the same metadata
        addInteractableComponent({
          name: componentBlock.name,
          description: registeredComponent.description,
          component: registeredComponent.component,
          props: componentBlock.props ?? {},
          propsSchema: registeredComponent.props,
          stateSchema: registeredComponent.state,
          annotations: registeredComponent.annotations,
        });

        processedComponentsRef.current.add(componentId);
      } catch (error) {
        // Component not found in registry - skip
        console.warn(
          `[AutoInteractablesManager] Component ${componentBlock.name} not found in registry, skipping auto-registration`,
        );
      }
    }
  }, [
    autoAddComponentsToInteractables,
    streamState,
    addInteractableComponent,
    getInteractableComponent,
    registry.componentList,
  ]);

  return null;
}
