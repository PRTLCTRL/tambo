"use client";

/**
 * Component that watches for new generated components in messages
 * and automatically adds them to the interactables list when enabled.
 * @internal
 */

import { useEffect, useRef } from "react";
import { useStreamState } from "./tambo-v1-stream-context";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import { useTamboRegistry } from "../../providers/tambo-registry-provider";

export interface AutoInteractableWatcherProps {
  /**
   * Whether to automatically add generated components to interactables.
   */
  enabled: boolean;
}

/**
 * Watches stream state for new component content blocks and automatically
 * registers them as interactable components when enabled.
 *
 * This component must be rendered within TamboStreamProvider and
 * TamboInteractableProvider contexts.
 * @param props - Component props
 * @param props.enabled - Whether automatic interactable addition is enabled
 * @returns null - this component renders nothing
 */
export function AutoInteractableWatcher({
  enabled,
}: AutoInteractableWatcherProps): null {
  const streamState = useStreamState();
  const { addInteractableComponent } = useTamboInteractable();
  const { getComponent } = useTamboRegistry();

  const addedComponentsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const currentThreadId = streamState.currentThreadId;
    if (!currentThreadId) {
      return;
    }

    const threadState = streamState.threadMap[currentThreadId];
    if (!threadState) {
      return;
    }

    const messages = threadState.thread.messages;

    for (const message of messages) {
      if (message.role !== "assistant") {
        continue;
      }

      for (const content of message.content) {
        if (content.type !== "component") {
          continue;
        }

        const uniqueKey = `${message.id}-${content.componentName}-${JSON.stringify(content.props)}`;

        if (addedComponentsRef.current.has(uniqueKey)) {
          continue;
        }

        const registeredComponent = getComponent(content.componentName);
        if (!registeredComponent) {
          continue;
        }

        const componentId = addInteractableComponent({
          name: content.componentName,
          description:
            registeredComponent.description ||
            `${content.componentName} component`,
          props: content.props,
          propsSchema: registeredComponent.propsSchema,
          stateSchema: registeredComponent.stateSchema,
          annotations: registeredComponent.annotations,
        });

        addedComponentsRef.current.add(uniqueKey);
      }
    }
  }, [streamState, enabled, addInteractableComponent, getComponent]);

  return null;
}
