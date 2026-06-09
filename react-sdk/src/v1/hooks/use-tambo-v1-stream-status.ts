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
 * For nested objects, contains nested PropStatus objects.
 * For arrays, includes completedItems and streamingItems.
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
   * Only present when the prop value is an array.
   */
  completedItems?: unknown[];

  /**
   * For array props: items currently streaming (the last item in the array).
   * Only present when the prop value is an array and is streaming.
   */
  streamingItems?: unknown[];
}

/**
 * Recursively builds status for nested objects and arrays.
 * @param value - The current value of the prop
 * @param path - Dot-notation path to the prop
 * @param startedProps - Set of paths that have received content
 * @param isStreamingDone - Whether the component is done streaming
 * @param isComponentStreaming - Whether the component is actively streaming
 * @returns PropStatus with nested structure for objects and array tracking for arrays
 */
function buildNestedPropStatus(
  value: unknown,
  path: string,
  startedProps: Set<string>,
  isStreamingDone: boolean,
  isComponentStreaming: boolean,
): PropStatus {
  const hasStarted = startedProps.has(path);
  const isComplete = hasStarted && isStreamingDone;

  const baseStatus: PropStatus = {
    isPending: !hasStarted && !isComplete,
    isStreaming: hasStarted && !isComplete && isComponentStreaming,
    isSuccess: isComplete,
    error: undefined,
  };

  if (Array.isArray(value)) {
    const completedItems: unknown[] = [];
    const streamingItems: unknown[] = [];

    if (isStreamingDone) {
      completedItems.push(...value);
    } else if (hasStarted && value.length > 0) {
      if (value.length > 1) {
        completedItems.push(...value.slice(0, -1));
      }
      streamingItems.push(value[value.length - 1]);
    }

    return {
      ...baseStatus,
      completedItems,
      streamingItems: streamingItems.length > 0 ? streamingItems : undefined,
    };
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const nestedStatus: Record<string, PropStatus> = {};

    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      const nestedPath = `${path}.${nestedKey}`;
      nestedStatus[nestedKey] = buildNestedPropStatus(
        nestedValue,
        nestedPath,
        startedProps,
        isStreamingDone,
        isComponentStreaming,
      );
    }

    return {
      ...baseStatus,
      ...nestedStatus,
    };
  }

  return baseStatus;
}

/**
 * Recursively extracts all paths from nested objects and arrays.
 * @param obj - Object to extract paths from
 * @param prefix - Current path prefix
 * @returns Set of all dot-notation paths
 */
function extractPaths(obj: unknown, prefix = ""): Set<string> {
  const paths = new Set<string>();

  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = prefix ? `${prefix}.${key}` : key;
      const hasContent = value !== undefined && value !== null && value !== "";
      if (hasContent) {
        paths.add(currentPath);
        if (value && typeof value === "object") {
          const nestedPaths = extractPaths(value, currentPath);
          for (const nestedPath of nestedPaths) {
            paths.add(nestedPath);
          }
        }
      }
    }
  } else if (Array.isArray(obj)) {
    if (obj.length > 0) {
      paths.add(prefix);
    }
  } else if (obj !== undefined && obj !== null && obj !== "") {
    paths.add(prefix);
  }

  return paths;
}

/**
 * Track streaming status for individual props by monitoring their values.
 * Monitors when props receive their first token and when they complete streaming.
 * Supports nested objects and arrays with completedItems/streamingItems.
 * @template Props - The type of the component props being tracked
 * @param props - The current component props object
 * @param componentStreamingState - The current streaming state of the component
 * @returns A record mapping each prop key to its PropStatus (with nested status for objects/arrays)
 */
function usePropsStreamingStatus<Props extends object>(
  props: Props | undefined,
  componentStreamingState: TamboComponentContent["streamingState"] | undefined,
): Partial<Record<keyof Props, PropStatus>> {
  /** Track which props (and nested paths) have received content */
  const [startedProps, setStartedProps] = useState(new Set<string>());

  /** Update started props when content arrives */
  useEffect(() => {
    if (!props) return;

    setStartedProps((prev) => {
      const allPaths = new Set<string>();

      for (const [key, value] of Object.entries(props)) {
        const paths = extractPaths(value, key);
        for (const path of paths) {
          allPaths.add(path);
        }
      }

      const hasChanges = allPaths.size !== prev.size || 
        [...allPaths].some(path => !prev.has(path));

      return hasChanges ? allPaths : prev;
    });
  }, [props]);

  /** Derive prop statuses from started props and streaming state */
  return useMemo(() => {
    if (!props) return {} as Record<keyof Props, PropStatus>;

    const isStreamingDone = componentStreamingState === "done";
    const isComponentStreaming = componentStreamingState === "streaming";

    const result = {} as Record<keyof Props, PropStatus>;
    for (const [key, value] of Object.entries(props)) {
      result[key as keyof Props] = buildNestedPropStatus(
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
  propStatus: Partial<Record<string, PropStatus>>,
  hasComponent: boolean,
  streamError?: Error,
): StreamStatus {
  const propStatuses: PropStatus[] = Object.values(propStatus).filter(
    (p): p is PropStatus => p !== undefined,
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
 * **Nested Objects**: Status contains nested PropStatus objects for nested properties.
 * Access via `propStatus.parent.child.isStreaming`.
 *
 * **Arrays**: Status includes `completedItems` (all items except the last during streaming)
 * and `streamingItems` (the last item while streaming). Access via `propStatus.arrayField.completedItems`.
 *
 * Pair with `useTamboComponentState` to disable inputs while streaming.
 * @see {@link https://docs.tambo.co/concepts/generative-interfaces/component-state}
 * @template Props - Component props type
 * @returns `streamStatus` (overall) and `propStatus` (per-prop) flags
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
 * // Display completed array items
 * const { propStatus } = useTamboStreamStatus<{ items: Item[] }>();
 * const completedItems = propStatus.items?.completedItems ?? [];
 * return <ul>{completedItems.map(item => <li key={item.id}>{item.name}</li>)}</ul>;
 * ```
 */
export function useTamboStreamStatus<
  Props extends object = Record<string, unknown>,
>(): {
  streamStatus: StreamStatus;
  propStatus: Partial<Record<keyof Props, PropStatus>>;
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
