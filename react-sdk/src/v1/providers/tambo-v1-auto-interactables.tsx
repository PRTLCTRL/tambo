"use client";

/**
 * Auto Interactables Manager
 *
 * Internal component that monitors stream state and automatically adds
 * generated components to the interactables list when enabled.
 */

import { useEffect, useRef } from "react";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import { useTamboRegistry } from "../../providers/tambo-registry-provider";
import { getComponentFromRegistry } from "../../util/registry";
import { useTamboConfig } from "./tambo-v1-provider";
import { useStreamState } from "./tambo-v1-stream-context";
import type { TamboComponentContent } from "../types/message";

/**
 * Internal component that automatically adds components to interactables
 * when autoAddComponentsToInteractables is enabled.
 *
 * Monitors assistant messages for components and registers them as interactables
 * so they can be updated by the AI in subsequent messages.
 * @internal
 * @returns null - this component renders nothing
 */
export function AutoInteractablesManager(): null {
  const config = useTamboConfig();
  const state = useStreamState();
  const { addInteractableComponent } = useTamboInteractable();
  const { componentList } = useTamboRegistry();
  const processedComponentsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!config.autoAddComponentsToInteractables) {
      return;
    }

    const currentThread = state.threadMap[state.currentThreadId];
    if (!currentThread) {
      return;
    }

    const assistantMessages = currentThread.thread.messages.filter(
      (msg) => msg.role === "assistant",
    );

    for (const message of assistantMessages) {
      for (const content of message.content) {
        if (content.type === "component") {
          const componentContent = content as TamboComponentContent;
          const componentId = componentContent.id;

          if (processedComponentsRef.current.has(componentId)) {
            continue;
          }

          try {
            const registeredComponent = getComponentFromRegistry(
              componentContent.name,
              componentList,
            );

            addInteractableComponent({
              name: registeredComponent.name,
              description:
                registeredComponent.description ??
                `Component ${registeredComponent.name}`,
              component: registeredComponent.component,
              props: (componentContent.props ?? {}) as Record<string, unknown>,
              propsSchema: registeredComponent.props,
            });

            processedComponentsRef.current.add(componentId);
          } catch (error) {
            console.warn(
              `[AutoInteractablesManager] Failed to add component ${componentContent.name} to interactables:`,
              error,
            );
          }
        }
      }
    }
  }, [
    config.autoAddComponentsToInteractables,
    state.threadMap,
    state.currentThreadId,
    addInteractableComponent,
    componentList,
  ]);

  return null;
}
