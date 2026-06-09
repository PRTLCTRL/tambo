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
 * For nested objects, each nested field also has a PropStatus.
 * For arrays, includes completedItems and streamingItems fields.
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
   * For array props: items that have completed streaming.
   * Each item is the complete value from the array.
   */
  completedItems?: unknown[];

  /**
   * For array props: items currently streaming.
   * These items may still be incomplete.
   */
  streamingItems?: unknown[];
}

/**
 * Recursive type for nested prop status tracking.
 * Each nested object property gets its own PropStatus, and those PropStatus objects
 * can themselves contain nested PropStatus for deeper nesting.
 */
export type NestedPropStatus = PropStatus & {
  [key: string]: NestedPropStatus | undefined;
};

/**
 * Check if a value is a plain object (not null, not array, not Date, etc.).
 * @param value - The value to check
 * @returns True if the value is a plain object
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === "[object Object]"
  );
}

/**
 * Check if a value has meaningful content (not empty).
 * @param value - The value to check
 * @returns True if the value has content
 */
function hasContent(value: unknown): boolean {
  if (value === undefined || value === null || value === "") {
    return false;
  }
  if (Array.isArray(value) && value.length === 0) {
    return false;
  }
  if (isPlainObject(value) && Object.keys(value).length === 0) {
    return false;
  }
  return true;
}

/**
 * Build a prop path string for nested tracking.
 * @param parentPath - Parent path (empty string for root)
 * @param key - Current key
 * @returns The full path
 */
function buildPath(parentPath: string, key: string): string {
  return parentPath ? `${parentPath}.${key}` : key;
}

/**
 * Recursively collect all paths that have content in a props object.
 * @param value - The value to traverse
 * @param path - Current path (default: root)
 * @param paths - Set to collect paths
 */
function collectStartedPaths(
  value: unknown,
  path: string,
  paths: Set<string>,
): void {
  if (!hasContent(value)) {
    return;
  }

  paths.add(path);

  if (isPlainObject(value)) {
    for (const [key, nestedValue] of Object.entries(value)) {
      collectStartedPaths(nestedValue, buildPath(path, key), paths);
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectStartedPaths(item, buildPath(path, `[${index}]`), paths);
    });
  }
}

/**
 * Build nested PropStatus for a value.
 * @param value - The prop value
 * @param path - Current path
 * @param startedPaths - Set of paths that have started
 * @param isStreamingDone - Whether streaming is complete
 * @param isComponentStreaming - Whether component is currently streaming
 * @returns PropStatus with nested tracking
 */
function buildPropStatus(
  value: unknown,
  path: string,
  startedPaths: Set<string>,
  isStreamingDone: boolean,
  isComponentStreaming: boolean,
): NestedPropStatus {
  const hasStarted = startedPaths.has(path);
  const isComplete = hasStarted && isStreamingDone;

  const status: NestedPropStatus = {
    isPending: !hasStarted && !isComplete,
    isStreaming: hasStarted && !isComplete && isComponentStreaming,
    isSuccess: isComplete,
    error: undefined,
  };

  // Handle arrays: add completedItems and streamingItems
  if (Array.isArray(value)) {
    const completedItems: unknown[] = [];
    const streamingItems: unknown[] = [];

    value.forEach((item, index) => {
      const itemPath = buildPath(path, `[${index}]`);
      const itemHasStarted = startedPaths.has(itemPath);
      const itemIsComplete = itemHasStarted && isStreamingDone;

      if (itemIsComplete) {
        completedItems.push(item);
      } else if (itemHasStarted) {
        streamingItems.push(item);
      }
    });

    status.completedItems = completedItems;
    status.streamingItems = streamingItems;
  }

  // Handle nested objects: recursively build status for each property
  if (isPlainObject(value)) {
    for (const [key, nestedValue] of Object.entries(value)) {
      const nestedPath = buildPath(path, key);
      status[key] = buildPropStatus(
        nestedValue,
        nestedPath,
        startedPaths,
        isStreamingDone,
        isComponentStreaming,
      );
    }
  }

  return status;
}

/**
 * Track streaming status for individual props by monitoring their values.
 * Monitors when props receive their first token and when they complete streaming.
 * Supports nested objects and arrays with completedItems/streamingItems tracking.
 * @template Props - The type of the component props being tracked
 * @param props - The current component props object
 * @param componentStreamingState - The current streaming state of the component
 * @returns A record mapping each prop key to its nested PropStatus
 */
function usePropsStreamingStatus<Props extends object>(
  props: Props | undefined,
  componentStreamingState: TamboComponentContent["streamingState"] | undefined,
): Partial<Record<keyof Props, NestedPropStatus>> {
  /** Track which prop paths have received content */
  const [startedPaths, setStartedPaths] = useState(new Set<string>());

  /** Update started paths when content arrives */
  useEffect(() => {
    if (!props) return;

    setStartedPaths((prev) => {
      const newStarted = new Set<string>();
      for (const [key, value] of Object.entries(props)) {
        collectStartedPaths(value, key, newStarted);
      }

      // Check if anything changed
      const changed =
        newStarted.size !== prev.size ||
        Array.from(newStarted).some((path) => !prev.has(path));

      return changed ? newStarted : prev;
    });
  }, [props]);

  /** Derive prop statuses from started paths and streaming state */
  return useMemo(() => {
    if (!props) return {} as Record<keyof Props, NestedPropStatus>;

    const isStreamingDone = componentStreamingState === "done";
    const isComponentStreaming = componentStreamingState === "streaming";

    const result = {} as Record<keyof Props, NestedPropStatus>;
    for (const key of Object.keys(props)) {
      const value = props[key as keyof Props];
      result[key as keyof Props] = buildPropStatus(
        value,
        key,
        startedPaths,
        isStreamingDone,
        isComponentStreaming,
      );
    }
    return result;
  }, [props, startedPaths, componentStreamingState]);
}

/**
 * Recursively check if any nested prop is streaming.
 * @param status - PropStatus to check
 * @returns True if this prop or any nested prop is streaming
 */
function hasAnyStreaming(status: NestedPropStatus): boolean {
  if (status.isStreaming) return true;

  for (const key of Object.keys(status)) {
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
    const nestedStatus = status[key];
    if (nestedStatus && hasAnyStreaming(nestedStatus)) {
      return true;
    }
  }

  return false;
}

/**
 * Recursively check if all nested props are successful.
 * @param status - PropStatus to check
 * @returns True if this prop and all nested props are successful
 */
function areAllSuccessful(status: NestedPropStatus): boolean {
  if (!status.isSuccess) return false;

  for (const key of Object.keys(status)) {
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
    const nestedStatus = status[key];
    if (nestedStatus && !areAllSuccessful(nestedStatus)) {
      return false;
    }
  }

  return true;
}

/**
 * Recursively check if any nested prop has an error.
 * @param status - PropStatus to check
 * @returns The first error found, or undefined
 */
function findAnyError(status: NestedPropStatus): Error | undefined {
  if (status.error) return status.error;

  for (const key of Object.keys(status)) {
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
    const nestedStatus = status[key];
    if (nestedStatus) {
      const nestedError = findAnyError(nestedStatus);
      if (nestedError) return nestedError;
    }
  }

  return undefined;
}

/**
 * Recursively check if all nested props are pending.
 * @param status - PropStatus to check
 * @returns True if this prop and all nested props are pending
 */
function areAllPending(status: NestedPropStatus): boolean {
  if (!status.isPending) return false;

  for (const key of Object.keys(status)) {
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
    const nestedStatus = status[key];
    if (nestedStatus && !areAllPending(nestedStatus)) {
      return false;
    }
  }

  return true;
}

/**
 * Derives global StreamStatus from component streaming state and individual prop statuses.
 * Aggregates individual prop states (including nested props) into a unified stream status.
 * @param componentStreamingState - The current streaming state of the component
 * @param propStatus - Status record for each individual prop (with nested tracking)
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
  const propStatuses: NestedPropStatus[] = Object.values(propStatus).filter(
    (p): p is NestedPropStatus => p !== undefined,
  );
  const isStreamError = !!streamError;

  // Check if all top-level props (and their nested props) are successful
  const allPropsSuccessful =
    propStatuses.length > 0 && propStatuses.every(areAllSuccessful);

  // Component is streaming if streamingState is "streaming" (even before props start)
  const isComponentStreaming = componentStreamingState === "streaming";
  const anyPropStreaming = propStatuses.some(hasAnyStreaming);

  // Check if all top-level props (and their nested props) are pending
  const allPropsPending = propStatuses.every(areAllPending);

  // Find first error from stream or any prop (including nested)
  const firstPropError = propStatuses.reduce<Error | undefined>(
    (error, status) => error ?? findAnyError(status),
    undefined,
  );
  const firstError = streamError ?? firstPropError;

  return {
    /** isPending: no component yet OR (not streaming, not error, not success, and all props pending) */
    isPending:
      !hasComponent ||
      (!isStreamError &&
        !isComponentStreaming &&
        !allPropsSuccessful &&
        allPropsPending),

    /** isStreaming: component is streaming OR any prop is streaming (but not if error) */
    isStreaming: !isStreamError && (isComponentStreaming || anyPropStreaming),

    /** isSuccess: all props successful and no error */
    isSuccess: allPropsSuccessful && !isStreamError,

    /** isError: stream error OR any prop error */
    isError: isStreamError || !!firstPropError,

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
 * - Nested objects: Access via `propStatus.user?.name?.isStreaming`
 * - Arrays: Access completed items via `propStatus.items?.completedItems`
 *
 * Pair with `useTamboComponentState` to disable inputs while streaming.
 * @see {@link https://docs.tambo.co/concepts/generative-interfaces/component-state}
 * @template Props - Component props type
 * @returns `streamStatus` (overall) and `propStatus` (per-prop with nested tracking)
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
 * const { propStatus } = useTamboStreamStatus<Props>();
 * <div className={propStatus.user?.name?.isStreaming ? "opacity-50" : ""}>
 *   {props.user?.name}
 * </div>
 * ```
 * @example
 * ```tsx
 * // Display only completed array items
 * const { propStatus } = useTamboStreamStatus<Props>();
 * const items = propStatus.items?.completedItems ?? [];
 * return <ul>{items.map(item => <li key={item.id}>{item.name}</li>)}</ul>;
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
