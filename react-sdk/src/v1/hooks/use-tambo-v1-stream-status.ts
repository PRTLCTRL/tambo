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
 * Base streaming status flags for individual component props.
 * Tracks the state of each prop as it streams from the LLM.
 */
export interface BasePropStatus {
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
}

/**
 * Extended streaming status for array props.
 * Includes tracking of completed and currently streaming items.
 */
export interface ArrayPropStatus extends BasePropStatus {
  /**
   * For array props: items that have completed streaming.
   */
  completedItems: unknown[];

  /**
   * For array props: items currently being streamed.
   */
  streamingItems: unknown[];
}

/**
 * Streaming status that may contain nested statuses for object properties.
 */
export type PropStatus = BasePropStatus &
  (ArrayPropStatus | Record<string, never>) &
  Record<string, PropStatus | undefined>;

/**
 * Maps component props to their streaming status structure.
 * For nested objects, the structure mirrors the prop hierarchy.
 * For arrays, includes completedItems and streamingItems.
 */
export type PropStatusMap<Props extends object> = {
  [K in keyof Props]?: Props[K] extends Array<infer _Item>
    ? ArrayPropStatus
    : Props[K] extends object
      ? BasePropStatus & PropStatusMap<Props[K]>
      : BasePropStatus;
};

/**
 * Check if a value has streaming content (not empty/undefined/null).
 * @param value - The value to check
 * @returns True if the value has content
 */
function hasContent(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

/**
 * Build nested status object for a given value.
 * @param value - The prop value (can be primitive, object, or array)
 * @param propPath - Dot-notation path to this prop
 * @param startedProps - Set of paths that have received content
 * @param isStreamingDone - Whether component streaming is complete
 * @param isComponentStreaming - Whether component is currently streaming
 * @returns PropStatus with nested structure for objects
 */
function buildPropStatus(
  value: unknown,
  propPath: string,
  startedProps: Set<string>,
  isStreamingDone: boolean,
  isComponentStreaming: boolean,
): BasePropStatus | ArrayPropStatus | (BasePropStatus & Record<string, PropStatus>) {
  const hasStarted = startedProps.has(propPath);
  const isComplete = hasStarted && isStreamingDone;

  const baseStatus: BasePropStatus = {
    isPending: !hasStarted && !isComplete,
    isStreaming: hasStarted && !isComplete && isComponentStreaming,
    isSuccess: isComplete,
    error: undefined,
  };

  // Handle arrays: include completedItems and streamingItems
  if (Array.isArray(value)) {
    const arrayStatus: ArrayPropStatus = {
      ...baseStatus,
      completedItems: isComplete ? value : [],
      streamingItems: hasStarted && !isComplete ? value : [],
    };
    return arrayStatus;
  }

  // Handle objects: recursively build nested statuses
  if (value && typeof value === "object") {
    const nestedStatus: BasePropStatus & Record<string, PropStatus> = {
      ...baseStatus,
    };

    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      const nestedPath = `${propPath}.${nestedKey}`;
      nestedStatus[nestedKey] = buildPropStatus(
        nestedValue,
        nestedPath,
        startedProps,
        isStreamingDone,
        isComponentStreaming,
      ) as PropStatus;
    }

    return nestedStatus;
  }

  // Primitives: return base status only
  return baseStatus;
}

/**
 * Track streaming status for individual props by monitoring their values.
 * Monitors when props receive their first token and when they complete streaming.
 * Supports nested objects and arrays with specialized tracking.
 * @template Props - The type of the component props being tracked
 * @param props - The current component props object
 * @param componentStreamingState - The current streaming state of the component
 * @returns A map of each prop key to its streaming status (nested for objects/arrays)
 */
function usePropsStreamingStatus<Props extends object>(
  props: Props | undefined,
  componentStreamingState: TamboComponentContent["streamingState"] | undefined,
): PropStatusMap<Props> {
  /** Track which prop paths have received content (using dot notation for nested props) */
  const [startedProps, setStartedProps] = useState(new Set<string>());

  /** Update started props when content arrives (recursive for nested objects) */
  useEffect(() => {
    if (!props) return;

    /**
     * Recursively mark props as started when they receive content.
     * @param obj - Object to traverse
     * @param pathPrefix - Current path prefix (empty for root)
     * @param newStarted - Set to update with started paths
     * @returns True if any new props were marked as started
     */
    function markStartedProps(
      obj: unknown,
      pathPrefix: string,
      newStarted: Set<string>,
    ): boolean {
      let changed = false;

      if (!obj || typeof obj !== "object") {
        if (hasContent(obj) && !newStarted.has(pathPrefix)) {
          newStarted.add(pathPrefix);
          changed = true;
        }
        return changed;
      }

      // Mark the object/array itself as started if it has content
      if (hasContent(obj) && !newStarted.has(pathPrefix)) {
        newStarted.add(pathPrefix);
        changed = true;
      }

      // Recursively process object properties
      for (const [key, value] of Object.entries(obj)) {
        const propPath = pathPrefix ? `${pathPrefix}.${key}` : key;
        if (markStartedProps(value, propPath, newStarted)) {
          changed = true;
        }
      }

      return changed;
    }

    setStartedProps((prev) => {
      const newStarted = new Set(prev);
      const changed = markStartedProps(props, "", newStarted);
      return changed ? newStarted : prev;
    });
  }, [props]);

  /** Derive prop statuses from started props and streaming state */
  return useMemo(() => {
    if (!props) return {} as PropStatusMap<Props>;

    const isStreamingDone = componentStreamingState === "done";
    const isComponentStreaming = componentStreamingState === "streaming";

    const result: PropStatusMap<Props> = {};
    for (const key of Object.keys(props)) {
      const value = props[key as keyof Props];
      result[key as keyof Props] = buildPropStatus(
        value,
        key,
        startedProps,
        isStreamingDone,
        isComponentStreaming,
      ) as PropStatusMap<Props>[keyof Props];
    }
    return result;
  }, [props, startedProps, componentStreamingState]);
}

/**
 * Flatten a nested PropStatus structure into an array of BasePropStatus.
 * This is used to aggregate status across all nested properties.
 * @param status - A PropStatus that may have nested properties
 * @returns Array of all BasePropStatus objects found
 */
function flattenPropStatus(status: unknown): BasePropStatus[] {
  if (!status || typeof status !== "object") {
    return [];
  }

  const results: BasePropStatus[] = [];
  const obj = status as Record<string, unknown>;

  // Check if this is a prop status (has the required base fields)
  if (
    "isPending" in obj &&
    "isStreaming" in obj &&
    "isSuccess" in obj &&
    typeof obj.isPending === "boolean" &&
    typeof obj.isStreaming === "boolean" &&
    typeof obj.isSuccess === "boolean"
  ) {
    results.push({
      isPending: obj.isPending,
      isStreaming: obj.isStreaming,
      isSuccess: obj.isSuccess,
      error: obj.error as Error | undefined,
    });
  }

  // Recursively process nested properties (skip known array status fields)
  for (const [key, value] of Object.entries(obj)) {
    if (key !== "completedItems" && key !== "streamingItems") {
      results.push(...flattenPropStatus(value));
    }
  }

  return results;
}

/**
 * Derives global StreamStatus from component streaming state and individual prop statuses.
 * Aggregates individual prop states into a unified stream status.
 * @template Props - The type of the component props
 * @param componentStreamingState - The current streaming state of the component
 * @param propStatusMap - Status map for each individual prop
 * @param hasComponent - Whether a component exists in the current message
 * @param streamError - Any error from the streaming process itself
 * @returns The aggregated StreamStatus for the entire component
 */
function deriveGlobalStreamStatus(
  componentStreamingState: TamboComponentContent["streamingState"] | undefined,
  propStatusMap: PropStatusMap<object>,
  hasComponent: boolean,
  streamError?: Error,
): StreamStatus {
  // Flatten the nested prop status structure to get all leaf statuses
  const propStatuses: BasePropStatus[] = Object.values(propStatusMap).flatMap(
    (status) => flattenPropStatus(status),
  );
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
 * **New**: Supports nested objects and arrays:
 * - Nested objects: Access via `propStatus.user.name.isStreaming`
 * - Array fields: Use `propStatus.items.completedItems` and `propStatus.items.streamingItems`
 *
 * Pair with `useTamboComponentState` to disable inputs while streaming.
 * @see {@link https://docs.tambo.co/concepts/generative-interfaces/component-state}
 * @template Props - Component props type
 * @returns `streamStatus` (overall) and `propStatus` (per-prop, nested for objects/arrays) flags
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
 * // Track nested object streaming
 * const { propStatus } = useTamboStreamStatus<{ user: { name: string; email: string } }>();
 * if (propStatus.user?.name?.isStreaming) {
 *   // Name is still streaming
 * }
 * ```
 * @example
 * ```tsx
 * // Access completed array items
 * const { propStatus } = useTamboStreamStatus<{ items: Item[] }>();
 * const completed = propStatus.items?.completedItems ?? [];
 * return <List items={completed} />;
 * ```
 */
export function useTamboStreamStatus<
  Props extends object = Record<string, unknown>,
>(): {
  streamStatus: StreamStatus;
  propStatus: PropStatusMap<Props>;
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
