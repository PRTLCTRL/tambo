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
}

/**
 * Extended PropStatus for array fields, includes tracking of completed and streaming items.
 */
export interface ArrayPropStatus extends PropStatus {
  /**
   * Array items that have completed streaming.
   * Only populated when the prop is an array.
   */
  completedItems: unknown[];

  /**
   * Array items that are currently streaming.
   * Only populated when the prop is an array.
   */
  streamingItems: unknown[];
}

/**
 * Recursive type for nested prop status tracking.
 * Supports both nested objects and arrays.
 */
export type NestedPropStatus<T = unknown> = T extends unknown[]
  ? ArrayPropStatus
  : T extends object
    ? PropStatus & {
        [K in keyof T]?: NestedPropStatus<T[K]>;
      }
    : PropStatus;

/**
 * Check if a value has meaningful content (not empty/null/undefined).
 * @param value - The value to check
 * @returns True if the value has content
 */
function hasContent(value: unknown): boolean {
  if (value === undefined || value === null || value === "") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === "object") {
    return Object.keys(value).length > 0;
  }
  return true;
}

/**
 * Build a path string for nested property tracking.
 * @param parentPath - The parent path
 * @param key - The current key
 * @returns The full path string
 */
function buildPath(parentPath: string, key: string | number): string {
  return parentPath ? `${parentPath}.${key}` : String(key);
}

/**
 * Recursively track which nested properties have received content.
 * @param value - The value to track
 * @param path - The current property path
 * @param startedProps - Set of paths that have started
 * @returns Updated set of started property paths
 */
function trackNestedProps(
  value: unknown,
  path: string,
  startedProps: Set<string>,
): Set<string> {
  let newStarted = new Set(startedProps);

  if (hasContent(value)) {
    newStarted.add(path);

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        newStarted = trackNestedProps(item, buildPath(path, index), newStarted);
      });
    } else if (typeof value === "object" && value !== null) {
      for (const [key, nestedValue] of Object.entries(value)) {
        newStarted = trackNestedProps(
          nestedValue,
          buildPath(path, key),
          newStarted,
        );
      }
    }
  }

  return newStarted;
}

/**
 * Build nested status for a value recursively.
 * @param value - The value to build status for
 * @param path - The current property path
 * @param startedProps - Set of paths that have started
 * @param isStreamingDone - Whether streaming is complete
 * @param isComponentStreaming - Whether component is currently streaming
 * @returns The nested prop status
 */
function buildNestedStatus(
  value: unknown,
  path: string,
  startedProps: Set<string>,
  isStreamingDone: boolean,
  isComponentStreaming: boolean,
): NestedPropStatus {
  const hasStarted = startedProps.has(path);
  const isComplete = hasStarted && isStreamingDone;

  const basePropStatus: PropStatus = {
    isPending: !hasStarted && !isComplete,
    isStreaming: hasStarted && !isComplete && isComponentStreaming,
    isSuccess: isComplete,
    error: undefined,
  };

  if (Array.isArray(value)) {
    const completedItems: unknown[] = [];
    const streamingItems: unknown[] = [];

    value.forEach((item, index) => {
      const itemPath = buildPath(path, index);
      const itemHasStarted = startedProps.has(itemPath);
      const itemIsComplete = itemHasStarted && isStreamingDone;

      if (itemIsComplete) {
        completedItems.push(item);
      } else if (itemHasStarted && isComponentStreaming) {
        streamingItems.push(item);
      }
    });

    return {
      ...basePropStatus,
      completedItems,
      streamingItems,
    } as ArrayPropStatus;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0
  ) {
    const nestedStatus: Record<string, NestedPropStatus> = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      const nestedPath = buildPath(path, key);
      nestedStatus[key] = buildNestedStatus(
        nestedValue,
        nestedPath,
        startedProps,
        isStreamingDone,
        isComponentStreaming,
      );
    }

    return {
      ...basePropStatus,
      ...nestedStatus,
    } as NestedPropStatus;
  }

  return basePropStatus;
}

/**
 * Track streaming status for individual props by monitoring their values.
 * Monitors when props receive their first token and when they complete streaming.
 * Supports nested objects and arrays.
 * @template Props - The type of the component props being tracked
 * @param props - The current component props object
 * @param componentStreamingState - The current streaming state of the component
 * @returns A record mapping each prop key to its nested PropStatus
 */
function usePropsStreamingStatus<Props extends object>(
  props: Props | undefined,
  componentStreamingState: TamboComponentContent["streamingState"] | undefined,
): Partial<Record<keyof Props, NestedPropStatus<Props[keyof Props]>>> {
  /** Track which props (including nested) have received content */
  const [startedProps, setStartedProps] = useState(new Set<string>());

  /** Update started props when content arrives */
  useEffect(() => {
    if (!props) return;

    setStartedProps((prev) => {
      let newStarted = new Set(prev);

      for (const [key, value] of Object.entries(props)) {
        newStarted = trackNestedProps(value, key, newStarted);
      }

      const changed = newStarted.size !== prev.size;
      return changed ? newStarted : prev;
    });
  }, [props]);

  /** Derive prop statuses from started props and streaming state */
  return useMemo(() => {
    if (!props)
      return {} as Record<
        keyof Props,
        NestedPropStatus<Props[keyof Props]>
      >;

    const isStreamingDone = componentStreamingState === "done";
    const isComponentStreaming = componentStreamingState === "streaming";

    const result = {} as Record<
      keyof Props,
      NestedPropStatus<Props[keyof Props]>
    >;

    for (const [key, value] of Object.entries(props)) {
      result[key as keyof Props] = buildNestedStatus(
        value,
        key,
        startedProps,
        isStreamingDone,
        isComponentStreaming,
      ) as NestedPropStatus<Props[keyof Props]>;
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
   * Flatten nested prop statuses to get all leaf PropStatus values.
   * @param status - The prop status to flatten
   * @returns Array of all PropStatus values
   */
  function flattenPropStatuses(status: NestedPropStatus): PropStatus[] {
    const results: PropStatus[] = [];

    const basePropStatus: PropStatus = {
      isPending: status.isPending,
      isStreaming: status.isStreaming,
      isSuccess: status.isSuccess,
      error: status.error,
    };
    results.push(basePropStatus);

    for (const key of Object.keys(status)) {
      if (
        key !== "isPending" &&
        key !== "isStreaming" &&
        key !== "isSuccess" &&
        key !== "error" &&
        key !== "completedItems" &&
        key !== "streamingItems"
      ) {
        const nestedValue = status[key as keyof typeof status];
        if (
          nestedValue &&
          typeof nestedValue === "object" &&
          !Array.isArray(nestedValue) &&
          "isPending" in nestedValue &&
          "isStreaming" in nestedValue &&
          "isSuccess" in nestedValue
        ) {
          results.push(...flattenPropStatuses(nestedValue as NestedPropStatus));
        }
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
 * Pair with `useTamboComponentState` to disable inputs while streaming.
 * @see {@link https://docs.tambo.co/concepts/generative-interfaces/component-state}
 * @template Props - Component props type
 * @returns `streamStatus` (overall) and `propStatus` (per-prop, with nested support) flags
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
 * // Track nested object props
 * const { propStatus } = useTamboStreamStatus<{ user: { name: string; email: string } }>();
 * <div className={propStatus.user?.name?.isStreaming ? "animate-pulse" : ""}>
 *   {user.name}
 * </div>
 * ```
 * @example
 * ```tsx
 * // Access completed array items
 * const { propStatus } = useTamboStreamStatus<{ items: Item[] }>();
 * const items = propStatus.items?.completedItems ?? [];
 * return items.map(item => <ItemCard key={item.id} {...item} />);
 * ```
 */
export function useTamboStreamStatus<
  Props extends object = Record<string, unknown>,
>(): {
  streamStatus: StreamStatus;
  propStatus: Partial<Record<keyof Props, NestedPropStatus<Props[keyof Props]>>>;
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
