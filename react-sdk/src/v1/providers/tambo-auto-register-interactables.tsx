"use client";

import { useEffect, useRef } from "react";
import { useStreamState } from "./tambo-v1-stream-context";
import { useTamboConfig } from "./tambo-v1-provider";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import { useTamboRegistry } from "../../providers/tambo-registry-provider";
import type { TamboComponentContent } from "../types/message";

/**
 * Internal component that automatically registers generated components as interactables.
 * Only active when autoRegisterInteractables is enabled in TamboConfig.
 * @returns null - renders nothing
 * @internal
 */
export function AutoRegisterInteractables(): null {
  const { autoRegisterInteractables } = useTamboConfig();
  const streamState = useStreamState();
  const { addInteractableComponent } = useTamboInteractable();
  const { getComponent } = useTamboRegistry();
  const registeredComponentsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!autoRegisterInteractables) {
      return;
    }

    const currentThread = streamState.threadMap[streamState.currentThreadId];
    if (!currentThread) {
      return;
    }

    currentThread.thread.messages.forEach((message) => {
      message.content.forEach((content) => {
        if (content.type !== "component") {
          return;
        }

        const componentContent = content as TamboComponentContent;
        const componentId = componentContent.id;

        if (registeredComponentsRef.current.has(componentId)) {
          return;
        }

        const registeredComponent = getComponent(componentContent.name);
        if (!registeredComponent) {
          return;
        }

        try {
          addInteractableComponent({
            name: componentContent.name,
            props: componentContent.props || {},
            propsSchema: registeredComponent.propsSchema,
            annotations: registeredComponent.annotations,
          });

          registeredComponentsRef.current.add(componentId);
        } catch {
          // Silently skip if registration fails
        }
      });
    });
  }, [
    autoRegisterInteractables,
    streamState,
    addInteractableComponent,
    getComponent,
  ]);

  return null;
}
