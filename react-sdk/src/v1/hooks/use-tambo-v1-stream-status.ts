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
 * Extended status for array props, includes lists of completed and streaming items.
 */
export interface ArrayPropStatus<T = unknown> extends PropStatus {
  /**
   * Array items that have finished streaming (if component streaming is done).
   * Empty array if streaming is still in progress.
   */
  completedItems: T[];

  /**
   * Array items currently being streamed (if component streaming is active).
   * Empty array if streaming is complete or hasn't started.
   */
  streamingItems: T[];
}

/**
 * Type for nested prop status - can be a PropStatus, ArrayPropStatus, or nested object
 */
export type NestedPropStatus<T = unknown> = T extends Array<infer U>
  ? ArrayPropStatus<U>
  : T extends object
    ? PropStatus & { [K in keyof T]?: NestedPropStatus<T[K]> }
    : PropStatus;

/**
 * Helper to check if a value has meaningful content
 * @param value - Value to check
 * @returns True if value has content
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
 * Helper to recursively build path strings for nested props
 * @param parentPath - Path to parent prop
 * @param key - Current key
 * @returns Full path string
 */
function buildPath(parentPath: string, key: string): string {
  return parentPath ? `${parentPath}.${key}` : key;
}

/**
 * Helper to recursively track which props have started streaming
 * @param value - Current prop value
 * @param path - Current path in the object tree
 * @param startedProps - Set to update with started prop paths
 * @returns True if any props were newly started
 */
function trackStartedProps(
  value: unknown,
  path: string,
  startedProps: Set<string>,
): boolean {
  let changed = false;

  if (hasContent(value) && !startedProps.has(path)) {
    startedProps.add(path);
    changed = true;
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, nestedValue] of Object.entries(value)) {
      const nestedPath = buildPath(path, key);
      if (trackStartedProps(nestedValue, nestedPath, startedProps)) {
        changed = true;
      }
    }
  }

  return changed;
}

/**
 * Helper to build nested prop status for an object or array
 * @param value - Current prop value
 * @param path - Current path in the object tree
 * @param startedProps - Set of started prop paths
 * @param isStreamingDone - Whether component streaming is done
 * @param isComponentStreaming - Whether component is actively streaming
 * @returns PropStatus or nested structure
 */
function buildPropStatus(
  value: unknown,
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

  if (Array.isArray(value)) {
    return {
      ...baseStatus,
      completedItems: isStreamingDone ? value : [],
      streamingItems: isComponentStreaming && !isStreamingDone ? value : [],
    } as ArrayPropStatus;
  }

  if (value && typeof value === "object") {
    const nestedStatus: Record<string, NestedPropStatus> = {
      ...baseStatus,
    };

    for (const [key, nestedValue] of Object.entries(value)) {
      const nestedPath = buildPath(path, key);
      nestedStatus[key] = buildPropStatus(
        nestedValue,
        nestedPath,
        startedProps,
        isStreamingDone,
        isComponentStreaming,
      );
    }

    return nestedStatus as NestedPropStatus;
  }

  return baseStatus;
}

/**
 * Track streaming status for individual props by monitoring their values.
 * Monitors when props receive their first token and when they complete streaming.
 * Supports nested objects and arrays.
 * @template Props - The type of the component props being tracked
 * @param props - The current component props object
 * @param componentStreamingState - The current streaming state of the component
 * @returns A record mapping each prop key to its PropStatus (with nested support)
 */
function usePropsStreamingStatus<Props extends object>(
  props: Props | undefined,
  componentStreamingState: TamboComponentContent["streamingState"] | undefined,
): Partial<Record<keyof Props, NestedPropStatus>> {
  /** Track which props (including nested paths) have received content */
  const [startedProps, setStartedProps] = useState(new Set<string>());

  /** Update started props when content arrives (including nested props) */
  useEffect(() => {
    if (!props) return;

    setStartedProps((prev) => {
      const newStarted = new Set(prev);
      let changed = false;

      for (const [key, value] of Object.entries(props)) {
        if (trackStartedProps(value, key, newStarted)) {
          changed = true;
        }
      }

      return changed ? newStarted : prev;
    });
  }, [props]);

  /** Derive prop statuses from started props and streaming state (including nested) */
  return useMemo(() => {
    if (!props) return {} as Record<keyof Props, NestedPropStatus>;

    const isStreamingDone = componentStreamingState === "done";
    const isComponentStreaming = componentStreamingState === "streaming";

    const result = {} as Record<keyof Props, NestedPropStatus>;
    for (const [key, value] of Object.entries(props)) {
      result[key as keyof Props] = buildPropStatus(
        value,
        key,
        startedProps,
        isStreamingDone,
        isComponentStreaming,
      );
    }
    return result;
  }, [props, startedProps, componentStreamingState]);
}

/**
 * Helper to flatten nested prop statuses into a flat array of PropStatus objects
 * @param value - NestedPropStatus to flatten
 * @returns Array of PropStatus objects
 */
function flattenPropStatuses(value: NestedPropStatus): PropStatus[] {
  const result: PropStatus[] = [];

  // Add the current level's status
  const {
    isPending,
    isStreaming,
    isSuccess,
    error,
  }: PropStatus = value as PropStatus;
  result.push({ isPending, isStreaming, isSuccess, error });

  // Recursively collect nested statuses
  for (const [key, nestedValue] of Object.entries(value)) {
    if (
      typeof nestedValue === "object" &&
      nestedValue !== null &&
      "isPending" in nestedValue
    ) {
      result.push(...flattenPropStatuses(nestedValue as NestedPropStatus));
    }
  }

  return result;
}

/**
 * Derives global StreamStatus from component streaming state and individual prop statuses.
 * Aggregates individual prop states (including nested ones) into a unified stream status.
 * @template Props - The type of the component props
 * @param componentStreamingState - The current streaming state of the component
 * @param propStatus - Status record for each individual prop (may be nested)
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
  // Flatten all prop statuses (including nested ones) for aggregation
  const propStatuses: PropStatus[] = [];
  for (const status of Object.values(propStatus)) {
    if (status) {
      propStatuses.push(...flattenPropStatuses(status));
    }
  }

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
 * Supports nested objects and arrays:
 * - For nested objects: `propStatus.user?.name?.isStreaming`
 * - For arrays: `propStatus.items?.completedItems` and `propStatus.items?.streamingItems`
 *
 * Pair with `useTamboComponentState` to disable inputs while streaming.
 * @see {@link https://docs.tambo.co/concepts/generative-interfaces/component-state}
 * @template Props - Component props type
 * @returns `streamStatus` (overall) and `propStatus` (per-prop with nested support)
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
 * const completed = propStatus.items?.completedItems ?? [];
 * return <List items={completed} />;
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
