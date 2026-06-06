"use client";

import { useEffect, useRef } from "react";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import { useTamboRegistry } from "../../providers/tambo-registry-provider";
import { useTambo } from "../hooks/use-tambo-v1";
import { useTamboConfig } from "./tambo-v1-provider";
import type { TamboComponentContent } from "../types/message";

/**
 * Internal component that automatically registers completed components as interactables
 * when autoRegisterComponentsAsInteractables is enabled.
 *
 * This component watches messages for component content blocks that have finished streaming
 * (streamingState === "done") and automatically calls addInteractableComponent for each one.
 * @returns null (renders nothing).
 */
export function TamboAutoInteractables(): null {
  const config = useTamboConfig();
  const { messages } = useTambo();
  const { addInteractableComponent } = useTamboInteractable();
  const { getComponent } = useTamboRegistry();
  const processedComponentIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!config.autoRegisterComponentsAsInteractables) {
      return;
    }

    for (const message of messages) {
      if (message.role !== "assistant") {
        continue;
      }

      for (const content of message.content) {
        if (content.type !== "component") {
          continue;
        }

        const componentContent = content as TamboComponentContent;

        if (componentContent.streamingState !== "done") {
          continue;
        }

        if (processedComponentIds.current.has(componentContent.id)) {
          continue;
        }

        const registeredComponent = getComponent(componentContent.name);
        if (!registeredComponent) {
          console.warn(
            `[TamboAutoInteractables] Component "${componentContent.name}" not found in registry, skipping auto-registration`,
          );
          continue;
        }

        try {
          const interactableId = addInteractableComponent({
            name: componentContent.name,
            props: componentContent.props,
            propsSchema: registeredComponent.propsSchema,
            state: componentContent.state,
            annotations: registeredComponent.annotations,
          });

          processedComponentIds.current.add(componentContent.id);

          console.log(
            `[TamboAutoInteractables] Auto-registered component "${componentContent.name}" as interactable with ID "${interactableId}"`,
          );
        } catch (error) {
          console.error(
            `[TamboAutoInteractables] Failed to auto-register component "${componentContent.name}":`,
            error,
          );
        }
      }
    }
  }, [
    config.autoRegisterComponentsAsInteractables,
    messages,
    addInteractableComponent,
    getComponent,
  ]);

  return null;
}
