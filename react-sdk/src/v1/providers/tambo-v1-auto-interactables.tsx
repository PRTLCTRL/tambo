"use client";

/**
 * Auto-Interactables Manager
 *
 * Automatically adds AI-generated components to the interactables list when
 * the autoInteractables feature is enabled.
 */

import { useEffect, useRef } from "react";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import { useTamboRegistry } from "../../providers/tambo-registry-provider";
import { useStreamState } from "../hooks/use-tambo-v1";
import { useTamboConfig } from "./tambo-v1-provider";
import type { TamboComponentContent } from "../types/message";

/**
 * Internal component that automatically adds completed AI-generated components
 * to the interactables list when autoInteractables is enabled.
 *
 * This component monitors messages in the current thread and automatically
 * registers components that have finished streaming as interactable components.
 * @internal
 * @returns null - this component renders nothing
 */
export function AutoInteractablesManager(): null {
  const { autoInteractables } = useTamboConfig();
  const { addInteractableComponent } = useTamboInteractable();
  const { componentList } = useTamboRegistry();
  const streamState = useStreamState();
  
  const addedComponentsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!autoInteractables) return;

    const currentThread = streamState.threadMap[streamState.currentThreadId];
    if (!currentThread) return;

    const messages = currentThread.thread.messages;

    for (const message of messages) {
      if (message.role !== "assistant") continue;

      for (const content of message.content) {
        if (content.type !== "component") continue;

        const componentContent = content as TamboComponentContent;
        const componentId = componentContent.id;

        if (addedComponentsRef.current.has(componentId)) continue;

        const isComplete = componentContent.streamingState === "complete";
        if (!isComplete) continue;

        const componentMeta = componentList.find(
          (c) => c.name === componentContent.name,
        );
        if (!componentMeta) {
          console.warn(
            `[AutoInteractables] Component ${componentContent.name} not found in registry`,
          );
          continue;
        }

        try {
          addInteractableComponent({
            name: componentContent.name,
            props: componentContent.props ?? {},
            propsSchema: componentMeta.props,
          });
          addedComponentsRef.current.add(componentId);
        } catch (error) {
          console.error(
            `[AutoInteractables] Failed to add component ${componentContent.name} to interactables:`,
            error,
          );
        }
      }
    }
  }, [
    autoInteractables,
    streamState,
    addInteractableComponent,
    componentList,
  ]);

  return null;
}
