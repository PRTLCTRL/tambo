"use client";

import { useEffect, useRef } from "react";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import { useTamboRegistry } from "../../providers/tambo-registry-provider";
import { getComponentFromRegistry } from "../../util/registry";
import { useTamboConfig } from "./tambo-v1-provider";
import { useStreamState } from "./tambo-v1-stream-context";
import type { TamboComponentContent } from "../types/message";

/**
 * Internal component that automatically adds generated components to interactables
 * when autoAddToInteractables is enabled in TamboProvider.
 *
 * Watches the message stream for new component content blocks and adds them
 * to the interactables registry with their current props.
 *
 * @internal
 * @returns null - this component renders nothing
 */
export function AutoInteractablesManager(): null {
  const config = useTamboConfig();
  const { addInteractableComponent } = useTamboInteractable();
  const registry = useTamboRegistry();
  const streamState = useStreamState();

  const trackedComponentIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!config.autoAddToInteractables) {
      return;
    }

    const currentThreadState = streamState.threadMap[streamState.currentThreadId];
    if (!currentThreadState) {
      return;
    }

    const messages = currentThreadState.thread.messages;

    for (const message of messages) {
      if (message.role !== "assistant") {
        continue;
      }

      for (const content of message.content) {
        if (content.type !== "component") {
          continue;
        }

        const componentContent = content as TamboComponentContent;

        if (
          componentContent.streamingState !== "done" ||
          trackedComponentIds.current.has(componentContent.id)
        ) {
          continue;
        }

        try {
          const registeredComponent = getComponentFromRegistry(
            componentContent.name,
            registry.componentList,
          );

          addInteractableComponent({
            name: componentContent.name,
            description:
              registeredComponent.description ||
              `Generated component: ${componentContent.name}`,
            props: componentContent.props || {},
            propsSchema: registeredComponent.props,
            component: registeredComponent.component,
          });

          trackedComponentIds.current.add(componentContent.id);
        } catch (error) {
          console.warn(
            `[AutoInteractablesManager] Failed to add component ${componentContent.name} to interactables:`,
            error,
          );
        }
      }
    }
  }, [
    config.autoAddToInteractables,
    streamState,
    addInteractableComponent,
    registry.componentList,
  ]);

  return null;
}
