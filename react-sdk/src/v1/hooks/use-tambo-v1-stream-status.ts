"use client";

/**
 * useTamboStreamStatus - Stream Status Hook
 *
 * Provides granular streaming status for components being rendered,
 * allowing UI to respond to prop-level streaming states.
 *
 * Must be used within a component rendered via the component renderer.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useComponentContent } from "../utils/component-renderer";
import { useStreamState } from "../providers/tambo-v1-stream-context";
import { findComponentContent } from "@tambo-ai/client";
import type { TamboComponentContent } from "../types/message";

/**
 * Global stream status flags for a specific component in a message.
 * Represents the aggregate state across all props for this component only.
 * Once a component completes, its status remains stable regardless of other generations.
 */
export interface StreamStatus {
  /**
   * Indicates no tokens have been received for any prop and generation is not active.
   * Useful for showing initial loading states before any data arrives.
   */
  isPending: boolean;

  /**
   * Indicates active streaming - at least one prop is still streaming.
   * Use this to show loading animations or skeleton states during data transmission.
   */
  isStreaming: boolean;

  /**
   * Indicates successful completion - component streaming is done AND every prop finished without error.
   * Safe to render the final component when this is true.
   */
  isSuccess: boolean;

  /**
   * Indicates a fatal error occurred in any prop or the stream itself.
   * Check streamError for details about what went wrong.
   */
  isError: boolean;

  /**
   * The first fatal error encountered during streaming (if any).
   * Will be undefined if no errors occurred.
   */
  streamError?: Error;
}

/**
 * Streaming status flags for individual component props.
 * Tracks the state of each prop as it streams from the LLM.
 */
export interface PropStatus {
  /**
   * Indicates no tokens have been received for this specific prop yet.
   * The prop value is still undefined, null, or empty string.
   */
  isPending: boolean;

  /**
   * Indicates at least one token has been received but streaming is not complete.
   * The prop has partial content that may still be updating.
   */
  isStreaming: boolean;

  /**
   * Indicates this prop has finished streaming successfully.
   * The prop value is complete and stable.
   */
  isSuccess: boolean;

  /**
   * The error that occurred during streaming (if any).
   * Will be undefined if no error occurred for this prop.
   */
  error?: Error;

  /**
   * For array props: items that have finished streaming.
   * Only present when the prop value is an array.
   */
  completedItems?: unknown[];

  /**
   * For array props: items currently streaming.
   * Only present when the prop value is an array.
   */
  streamingItems?: unknown[];
}

/**
 * Enhanced PropStatus that supports nested tracking.
 * For object props, includes nested status for each child property.
 * For array props, includes completedItems and streamingItems arrays.
 */
export type NestedPropStatus =
  | (PropStatus & {
      [key: string]: PropStatus | NestedPropStatus;
    })
  | PropStatus;

/**
 * Helper to determine if a value is a plain object (not an array, null, or Date).
 * @param value - Value to check
 * @returns True if value is a plain object
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

/**
 * Helper to build nested status for an object prop.
 * Recursively tracks status for each nested property.
 * @param value - The object value to track
 * @param path - Path to this value (for tracking started state)
 * @param startedProps - Set of property paths that have started streaming
 * @param isStreamingDone - Whether component streaming is complete
 * @param isComponentStreaming - Whether component is actively streaming
 * @returns Nested prop status with child statuses
 */
function buildNestedPropStatus(
  value: Record<string, unknown>,
  path: string,
  startedProps: Set<string>,
  isStreamingDone: boolean,
  isComponentStreaming: boolean,
): NestedPropStatus {
  const hasStarted = startedProps.has(path);
  const isComplete = hasStarted && isStreamingDone;

  const baseStatus: PropStatus = {
    isPending: !hasStarted && !isComplete,
    isStreaming: hasStarted && !isComplete && isComponentStreaming,
    isSuccess: isComplete,
    error: undefined,
  };

  const result: NestedPropStatus = { ...baseStatus };

  for (const [childKey, childValue] of Object.entries(value)) {
    const childPath = `${path}.${childKey}`;

    if (isPlainObject(childValue)) {
      result[childKey] = buildNestedPropStatus(
        childValue,
        childPath,
        startedProps,
        isStreamingDone,
        isComponentStreaming,
      );
    } else if (Array.isArray(childValue)) {
      result[childKey] = buildArrayPropStatus(
        childValue,
        childPath,
        startedProps,
        isStreamingDone,
        isComponentStreaming,
      );
    } else {
      const childHasStarted = startedProps.has(childPath);
      const childIsComplete = childHasStarted && isStreamingDone;

      result[childKey] = {
        isPending: !childHasStarted && !childIsComplete,
        isStreaming:
          childHasStarted && !childIsComplete && isComponentStreaming,
        isSuccess: childIsComplete,
        error: undefined,
      };
    }
  }

  return result;
}

/**
 * Helper to build status for an array prop with completedItems and streamingItems.
 * @param value - The array value to track
 * @param path - Path to this value (for tracking started state)
 * @param startedProps - Set of property paths that have started streaming
 * @param isStreamingDone - Whether component streaming is complete
 * @param isComponentStreaming - Whether component is actively streaming
 * @returns Prop status with completedItems and streamingItems
 */
function buildArrayPropStatus(
  value: unknown[],
  path: string,
  startedProps: Set<string>,
  isStreamingDone: boolean,
  isComponentStreaming: boolean,
): PropStatus {
  const hasStarted = startedProps.has(path);
  const isComplete = hasStarted && isStreamingDone;

  const completedItems: unknown[] = [];
  const streamingItems: unknown[] = [];

  if (hasStarted && isComponentStreaming && !isComplete) {
    value.forEach((item, index) => {
      const itemPath = `${path}[${index}]`;
      const itemHasStarted = startedProps.has(itemPath);

      if (itemHasStarted) {
        streamingItems.push(item);
      }
    });
  } else if (isComplete) {
    completedItems.push(...value);
  }

  return {
    isPending: !hasStarted && !isComplete,
    isStreaming: hasStarted && !isComplete && isComponentStreaming,
    isSuccess: isComplete,
    error: undefined,
    completedItems: completedItems.length > 0 ? completedItems : undefined,
    streamingItems: streamingItems.length > 0 ? streamingItems : undefined,
  };
}

/**
 * Track streaming status for individual props by monitoring their values.
 * Monitors when props receive their first token and when they complete streaming.
 * Supports nested objects and arrays with completedItems/streamingItems tracking.
 * @template Props - The type of the component props being tracked
 * @param props - The current component props object
 * @param componentStreamingState - The current streaming state of the component
 * @returns A record mapping each prop key to its PropStatus (with nested tracking)
 */
function usePropsStreamingStatus<Props extends object>(
  props: Props | undefined,
  componentStreamingState: TamboComponentContent["streamingState"] | undefined,
): Partial<Record<keyof Props, NestedPropStatus>> {
  /** Track which property paths have received content */
  const [startedProps, setStartedProps] = useState(new Set<string>());

  /** Update started props when content arrives */
  useEffect(() => {
    if (!props) return;

    setStartedProps((prev) => {
      let changed = false;
      const newStarted = new Set(prev);

      /**
       * Recursively mark property paths as started.
       * @param obj - Object to traverse
       * @param pathPrefix - Current path prefix
       */
      function markStarted(obj: unknown, pathPrefix: string): void {
        if (isPlainObject(obj)) {
          const hasContent = Object.keys(obj).length > 0;
          if (hasContent && !newStarted.has(pathPrefix)) {
            newStarted.add(pathPrefix);
            changed = true;
          }

          for (const [key, value] of Object.entries(obj)) {
            const childPath = pathPrefix ? `${pathPrefix}.${key}` : key;
            markStarted(value, childPath);
          }
        } else if (Array.isArray(obj)) {
          const hasContent = obj.length > 0;
          if (hasContent && !newStarted.has(pathPrefix)) {
            newStarted.add(pathPrefix);
            changed = true;
          }

          obj.forEach((item, index) => {
            const itemPath = `${pathPrefix}[${index}]`;
            if (item !== undefined && item !== null && item !== "") {
              if (!newStarted.has(itemPath)) {
                newStarted.add(itemPath);
                changed = true;
              }
            }
            markStarted(item, itemPath);
          });
        } else {
          const hasContent =
            obj !== undefined && obj !== null && obj !== "";
          if (hasContent && !newStarted.has(pathPrefix)) {
            newStarted.add(pathPrefix);
            changed = true;
          }
        }
      }

      for (const [key, value] of Object.entries(props)) {
        markStarted(value, key);
      }

      return changed ? newStarted : prev;
    });
  }, [props]);

  /** Derive prop statuses from started props and streaming state */
  return useMemo(() => {
    if (!props) return {} as Record<keyof Props, NestedPropStatus>;

    const isStreamingDone = componentStreamingState === "done";
    const isComponentStreaming = componentStreamingState === "streaming";

    const result = {} as Record<keyof Props, NestedPropStatus>;
    for (const [key, value] of Object.entries(props)) {
      if (isPlainObject(value)) {
        result[key as keyof Props] = buildNestedPropStatus(
          value,
          key,
          startedProps,
          isStreamingDone,
          isComponentStreaming,
        );
      } else if (Array.isArray(value)) {
        result[key as keyof Props] = buildArrayPropStatus(
          value,
          key,
          startedProps,
          isStreamingDone,
          isComponentStreaming,
        );
      } else {
        const hasStarted = startedProps.has(key);
        const isComplete = hasStarted && isStreamingDone;

        result[key as keyof Props] = {
          isPending: !hasStarted && !isComplete,
          isStreaming: hasStarted && !isComplete && isComponentStreaming,
          isSuccess: isComplete,
          error: undefined,
        };
      }
    }
    return result;
  }, [props, startedProps, componentStreamingState]);
}

/**
 * Derives global StreamStatus from component streaming state and individual prop statuses.
 * Aggregates individual prop states into a unified stream status.
 * @template Props - The type of the component props
 * @param componentStreamingState - The current streaming state of the component
 * @param propStatus - Status record for each individual prop
 * @param hasComponent - Whether a component exists in the current message
 * @param streamError - Any error from the streaming process itself
 * @returns The aggregated StreamStatus for the entire component
 */
function deriveGlobalStreamStatus(
  componentStreamingState: TamboComponentContent["streamingState"] | undefined,
  propStatus: Partial<Record<string, NestedPropStatus>>,
  hasComponent: boolean,
  streamError?: Error,
): StreamStatus {
  /**
   * Flatten nested prop statuses to a list of base PropStatus objects.
   * @param status - Status object to flatten
   * @returns Array of PropStatus objects
   */
  function flattenPropStatuses(status: NestedPropStatus): PropStatus[] {
    const results: PropStatus[] = [];

    // Add the base status
    const baseStatus: PropStatus = {
      isPending: status.isPending,
      isStreaming: status.isStreaming,
      isSuccess: status.isSuccess,
      error: status.error,
    };
    results.push(baseStatus);

    // Recursively add nested statuses
    for (const [key, value] of Object.entries(status)) {
      if (
        key === "isPending" ||
        key === "isStreaming" ||
        key === "isSuccess" ||
        key === "error" ||
        key === "completedItems" ||
        key === "streamingItems"
      ) {
        continue;
      }

      if (typeof value === "object" && value !== null) {
        results.push(...flattenPropStatuses(value as NestedPropStatus));
      }
    }

    return results;
  }

  const propStatuses: PropStatus[] = Object.values(propStatus)
    .filter((p): p is NestedPropStatus => p !== undefined)
    .flatMap(flattenPropStatuses);

  const isStreamError = !!streamError;

  // If all props are already successful, the component is complete regardless of streaming state
  const allPropsSuccessful =
    propStatuses.length > 0 && propStatuses.every((p) => p.isSuccess);

  // Component is streaming if streamingState is "streaming" (even before props start)
  const isComponentStreaming = componentStreamingState === "streaming";
  const anyPropStreaming = propStatuses.some((p) => p.isStreaming);

  /** Find first error from stream or any prop */
  const firstError = streamError ?? propStatuses.find((p) => p.error)?.error;

  return {
    /** isPending: no component yet OR (not streaming, not error, not success, and all props pending) */
    isPending:
      !hasComponent ||
      (!isStreamError &&
        !isComponentStreaming &&
        !allPropsSuccessful &&
        propStatuses.every((p) => p.isPending)),

    /** isStreaming: component is streaming OR any prop is streaming (but not if error) */
    isStreaming: !isStreamError && (isComponentStreaming || anyPropStreaming),

    /** isSuccess: all props successful and no error */
    isSuccess: allPropsSuccessful && !isStreamError,

    /** isError: stream error OR any prop error */
    isError: isStreamError || propStatuses.some((p) => p.error),

    streamError: firstError,
  };
}

/**
 * Track streaming status for Tambo component props.
 *
 * **Important**: Props update repeatedly during streaming and may be partial.
 * Use `propStatus.<field>?.isSuccess` before treating a prop as complete.
 *
 * **Nested Objects**: Access nested status via `propStatus["parent"]["child"].isStreaming`
 *
 * **Arrays**: Access completed/streaming items via `propStatus["arrayField"].completedItems`
 *
 * Pair with `useTamboComponentState` to disable inputs while streaming.
 * @see {@link https://docs.tambo.co/concepts/generative-interfaces/component-state}
 * @template Props - Component props type
 * @returns `streamStatus` (overall) and `propStatus` (per-prop with nested tracking) flags
 * @throws {Error} When used outside a rendered component
 * @example
 * ```tsx
 * // Wait for entire stream
 * const { streamStatus } = useTamboStreamStatus();
 * if (!streamStatus.isSuccess) return <Spinner />;
 * return <Card {...props} />;
 * ```
 * @example
 * ```tsx
 * // Highlight in-flight props
 * const { propStatus } = useTamboStreamStatus<Props>();
 * <h2 className={propStatus.title?.isStreaming ? "animate-pulse" : ""}>
 *   {title}
 * </h2>
 * ```
 * @example
 * ```tsx
 * // Track nested object properties
 * const { propStatus } = useTamboStreamStatus<{ user: { name: string; email: string } }>();
 * if (propStatus.user?.name?.isStreaming) {
 *   // Name is streaming
 * }
 * ```
 * @example
 * ```tsx
 * // Show completed array items
 * const { propStatus } = useTamboStreamStatus<{ items: string[] }>();
 * const completed = propStatus.items?.completedItems ?? [];
 * return <ul>{completed.map(item => <li>{item}</li>)}</ul>;
 * ```
 */
export function useTamboStreamStatus<
  Props extends object = Record<string, unknown>,
>(): {
  streamStatus: StreamStatus;
  propStatus: Partial<Record<keyof Props, NestedPropStatus>>;
} {
  const { componentId, threadId } = useComponentContent();
  const streamState = useStreamState();

  /**
   * Error if componentId changes - this indicates the provider hierarchy is broken.
   * The componentId should remain stable for the lifetime of the component.
   * If this fires, the ComponentRenderer is likely being used incorrectly,
   * or the component tree is being remounted in unexpected ways.
   */
  const initialComponentIdRef = useRef(componentId);
  useEffect(() => {
    if (componentId !== initialComponentIdRef.current) {
      console.error(
        `useTamboStreamStatus: componentId changed from "${initialComponentIdRef.current}" to "${componentId}". ` +
          "This indicates a bug in the component tree or incorrect provider usage. " +
          "The componentId must remain stable for the component's lifetime. " +
          "Check that ComponentRenderer is not being remounted unexpectedly.",
      );
      initialComponentIdRef.current = componentId;
    }
  }, [componentId]);

  /** Get the current thread state */
  const threadState = streamState.threadMap[threadId];

  /** Get error message from stream state if any */
  const streamErrorMessage = threadState?.streaming.error?.message;

  /** Find the component content block */
  const componentContent = findComponentContent(
    streamState,
    threadId,
    componentId,
  );

  /** Get the current component props */
  const componentProps =
    (componentContent?.props as Props | undefined) ?? ({} as Props);

  /** Get the component streaming state */
  const componentStreamingState = componentContent?.streamingState;

  /** Track per-prop streaming status */
  const propStatus = usePropsStreamingStatus(
    componentProps,
    componentStreamingState,
  );

  /** Derive global stream status from prop statuses and component streaming state */
  const streamStatus = useMemo(() => {
    const hasComponent = !!componentContent;
    const streamError = streamErrorMessage
      ? new Error(streamErrorMessage)
      : undefined;
    return deriveGlobalStreamStatus(
      componentStreamingState,
      propStatus,
      hasComponent,
      streamError,
    );
  }, [
    componentStreamingState,
    propStatus,
    componentContent,
    streamErrorMessage,
  ]);

  return {
    streamStatus,
    propStatus,
  };
}
