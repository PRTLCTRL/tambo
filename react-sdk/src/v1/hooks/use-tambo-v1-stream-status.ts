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
   * Only populated when the prop value is an array.
   */
  completedItems?: unknown[];

  /**
   * For array props: items currently being streamed.
   * Only populated when the prop value is an array.
   */
  streamingItems?: unknown[];
}

/**
 * Streaming status structure that can contain nested status for object properties.
 * For nested objects, the status object includes both the parent status and nested child statuses.
 */
export type NestedPropStatus<T = unknown> = PropStatus &
  (T extends object
    ? T extends unknown[]
      ? Record<string, never>
      : {
          [K in keyof T]?: NestedPropStatus<T[K]>;
        }
    : Record<string, never>);

/**
 * Check if a value has meaningful content (not empty)
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
 * Build nested prop status recursively for an object value
 * @param value - The current value (can be primitive, object, or array)
 * @param path - The dot-separated path to this value
 * @param startedPaths - Set of paths that have received content
 * @param isStreamingDone - Whether the component streaming is complete
 * @param isComponentStreaming - Whether the component is currently streaming
 * @returns PropStatus with nested statuses for objects
 */
function buildNestedPropStatus(
  value: unknown,
  path: string,
  startedPaths: Set<string>,
  isStreamingDone: boolean,
  isComponentStreaming: boolean,
): PropStatus {
  const hasStarted = startedPaths.has(path);
  const isComplete = hasStarted && isStreamingDone;

  const basePropStatus: PropStatus = {
    isPending: !hasStarted && !isComplete,
    isStreaming: hasStarted && !isComplete && isComponentStreaming,
    isSuccess: isComplete,
    error: undefined,
  };

  // Handle arrays
  if (Array.isArray(value)) {
    const completedItems: unknown[] = [];
    const streamingItems: unknown[] = [];

    if (isStreamingDone) {
      completedItems.push(...value);
    } else if (isComponentStreaming && hasStarted) {
      value.forEach((item, index) => {
        const itemPath = `${path}[${index}]`;
        if (startedPaths.has(itemPath)) {
          if (index === value.length - 1) {
            streamingItems.push(item);
          } else {
            completedItems.push(item);
          }
        }
      });
    }

    return {
      ...basePropStatus,
      completedItems,
      streamingItems,
    };
  }

  // Handle nested objects
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0
  ) {
    const nestedStatus: Record<string, PropStatus> = {};

    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      const nestedPath = `${path}.${nestedKey}`;
      nestedStatus[nestedKey] = buildNestedPropStatus(
        nestedValue,
        nestedPath,
        startedPaths,
        isStreamingDone,
        isComponentStreaming,
      );
    }

    return {
      ...basePropStatus,
      ...nestedStatus,
    };
  }

  return basePropStatus;
}

/**
 * Track which paths in the props tree have received content
 * @param props - The current component props
 * @param parentPath - The parent path prefix (for recursion)
 * @returns Set of all paths that have content
 */
function collectStartedPaths(
  props: unknown,
  parentPath = "",
): Set<string> {
  const paths = new Set<string>();

  if (!props || typeof props !== "object") {
    return paths;
  }

  if (Array.isArray(props)) {
    if (props.length > 0) {
      paths.add(parentPath);
      props.forEach((item, index) => {
        const itemPath = `${parentPath}[${index}]`;
        if (hasContent(item)) {
          paths.add(itemPath);
        }
        if (item && typeof item === "object") {
          const nestedPaths = collectStartedPaths(item, itemPath);
          nestedPaths.forEach((p) => paths.add(p));
        }
      });
    }
    return paths;
  }

  for (const [key, value] of Object.entries(props)) {
    const currentPath = parentPath ? `${parentPath}.${key}` : key;

    if (hasContent(value)) {
      paths.add(currentPath);

      if (value && typeof value === "object") {
        const nestedPaths = collectStartedPaths(value, currentPath);
        nestedPaths.forEach((p) => paths.add(p));
      }
    }
  }

  return paths;
}

/**
 * Track streaming status for individual props by monitoring their values.
 * Monitors when props receive their first token and when they complete streaming.
 * Supports nested objects and arrays.
 * @template Props - The type of the component props being tracked
 * @param props - The current component props object
 * @param componentStreamingState - The current streaming state of the component
 * @returns A record mapping each prop key to its NestedPropStatus
 */
function usePropsStreamingStatus<Props extends object>(
  props: Props | undefined,
  componentStreamingState: TamboComponentContent["streamingState"] | undefined,
): Partial<Record<keyof Props, NestedPropStatus>> {
  /** Track which paths have received content */
  const [startedPaths, setStartedPaths] = useState(new Set<string>());

  /** Update started paths when content arrives */
  useEffect(() => {
    if (!props) return;

    setStartedPaths((prev) => {
      const newPaths = collectStartedPaths(props);

      // Check if anything changed
      if (
        newPaths.size !== prev.size ||
        [...newPaths].some((p) => !prev.has(p))
      ) {
        return newPaths;
      }

      return prev;
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
      result[key as keyof Props] = buildNestedPropStatus(
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
 * Extract all base PropStatus objects from a nested status structure
 * @param propStatus - The nested prop status record
 * @returns Array of all PropStatus objects (flattened)
 */
function flattenPropStatuses(
  propStatus: Partial<Record<string, NestedPropStatus>>,
): PropStatus[] {
  const result: PropStatus[] = [];

  function traverse(status: NestedPropStatus | PropStatus) {
    // Add the base status
    result.push({
      isPending: status.isPending,
      isStreaming: status.isStreaming,
      isSuccess: status.isSuccess,
      error: status.error,
    });

    // Traverse nested properties (excluding array-specific fields and base PropStatus fields)
    for (const [key, value] of Object.entries(status)) {
      if (
        key !== "isPending" &&
        key !== "isStreaming" &&
        key !== "isSuccess" &&
        key !== "error" &&
        key !== "completedItems" &&
        key !== "streamingItems" &&
        value &&
        typeof value === "object" &&
        "isPending" in value
      ) {
        traverse(value as NestedPropStatus);
      }
    }
  }

  for (const status of Object.values(propStatus)) {
    if (status) {
      traverse(status);
    }
  }

  return result;
}

/**
 * Derives global StreamStatus from component streaming state and individual prop statuses.
 * Aggregates individual prop states into a unified stream status.
 * @template Props - The type of the component props
 * @param componentStreamingState - The current streaming state of the component
 * @param propStatus - Status record for each individual prop (including nested)
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
  const propStatuses = flattenPropStatuses(propStatus);
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
 * - For nested objects, access nested status via `propStatus.parent?.child?.isStreaming`
 * - For arrays, access completed items via `propStatus.arrayField?.completedItems`
 *
 * Pair with `useTamboComponentState` to disable inputs while streaming.
 * @see {@link https://docs.tambo.co/concepts/generative-interfaces/component-state}
 * @template Props - Component props type
 * @returns `streamStatus` (overall) and `propStatus` (per-prop) flags with nested support
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
 * {propStatus.user?.name?.isStreaming && <Spinner />}
 * ```
 * @example
 * ```tsx
 * // Display completed array items
 * const { propStatus } = useTamboStreamStatus<{ items: string[] }>();
 * {propStatus.items?.completedItems?.map((item, i) => <div key={i}>{item}</div>)}
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
