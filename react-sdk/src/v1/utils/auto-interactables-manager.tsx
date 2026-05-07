"use client";

/**
 * Auto Interactables Manager
 *
 * Internal component that automatically adds AI-generated components to the interactables list
 * when the autoInteractables feature is enabled. Sits inside the provider tree and watches
 * for new component messages.
 */

import { useEffect, useRef } from "react";
import { useTamboConfig } from "../providers/tambo-v1-provider";
import { useStreamState } from "../providers/tambo-v1-stream-context";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import { useTamboRegistry } from "../../providers/tambo-registry-provider";
import type { TamboComponentContent } from "../types/message";

/**
 * Internal component that manages automatic addition of components to interactables.
 * Only active when autoInteractables is enabled in TamboConfig.
 * @returns null (renders nothing)
 */
export function AutoInteractablesManager(): null {
  const config = useTamboConfig();
  const state = useStreamState();
  const { addInteractableComponent, getInteractableComponent } =
    useTamboInteractable();
  const { getRegisteredComponent } = useTamboRegistry();

  const processedComponentsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!config.autoInteractables) {
      return;
    }

    const currentThread = state.threads[state.currentThreadId];
    if (!currentThread) {
      return;
    }

    for (const message of currentThread.messages) {
      if (message.role !== "assistant") {
        continue;
      }

      for (const content of message.content) {
        if (content.type !== "component") {
          continue;
        }

        const componentContent = content as TamboComponentContent;
        const componentKey = `${message.id}_${componentContent.componentName}`;

        if (processedComponentsRef.current.has(componentKey)) {
          continue;
        }

        const registeredComponent = getRegisteredComponent(
          componentContent.componentName,
        );
        if (!registeredComponent) {
          processedComponentsRef.current.add(componentKey);
          continue;
        }

        const existingInteractables = getInteractableComponent(componentKey);
        if (existingInteractables) {
          processedComponentsRef.current.add(componentKey);
          continue;
        }

        try {
          const newId = addInteractableComponent({
            name: componentContent.componentName,
            description:
              registeredComponent.description ||
              `Auto-added ${componentContent.componentName}`,
            props: componentContent.props || {},
            propsSchema: registeredComponent.propsSchema,
            annotations: registeredComponent.annotations,
          });

          processedComponentsRef.current.add(componentKey);

          console.log(
            `[AutoInteractables] Added ${componentContent.componentName} to interactables with ID: ${newId}`,
          );
        } catch (error) {
          console.error(
            `[AutoInteractables] Failed to add ${componentContent.componentName}:`,
            error,
          );
          processedComponentsRef.current.add(componentKey);
        }
      }
    }
  }, [
    config.autoInteractables,
    state.threads,
    state.currentThreadId,
    addInteractableComponent,
    getInteractableComponent,
    getRegisteredComponent,
  ]);

  return null;
}
