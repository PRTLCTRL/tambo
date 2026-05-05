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
   * For array props: array items that have completed streaming.
   * Each item is stable and will not change further.
   */
  completedItems?: unknown[];

  /**
   * For array props: array items currently being streamed.
   * These items may still be updating as more tokens arrive.
   */
  streamingItems?: unknown[];

  /**
   * For object props: nested status tracking for child properties.
   * Contains the same PropStatus structure for each nested field.
   */
  [key: string]: PropStatus | boolean | Error | unknown[] | undefined;
}

/**
 * Recursively builds nested status structure for object props.
 * For each key in the props object, this creates a nested PropStatus with the same structure.
 * @template T - The type of the props being tracked
 */
export type NestedPropStatus<T> = {
  [K in keyof T]?: PropStatus &
    (T[K] extends object
      ? T[K] extends unknown[]
        ? Record<string, never>
        : NestedPropStatus<T[K]>
      : Record<string, never>);
};

/**
 * Checks if a value has started receiving content.
 * @param value - The value to check
 * @returns true if the value has received content, false otherwise
 */
function hasContent(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value) && value.length === 0) return false;
  if (
    typeof value === "object" &&
    value !== null &&
    Object.keys(value).length === 0
  )
    return false;
  return true;
}

/**
 * Recursively builds nested status for an object prop.
 * @param value - The nested object value
 * @param path - The current path for tracking started props
 * @param startedProps - Set of started prop paths
 * @param isStreamingDone - Whether component streaming is complete
 * @param isComponentStreaming - Whether component is currently streaming
 * @returns PropStatus with nested fields populated
 */
function buildNestedStatus(
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
    const completed: unknown[] = [];
    const streaming: unknown[] = [];

    if (isStreamingDone) {
      completed.push(...value);
    } else if (isComponentStreaming && value.length > 0) {
      completed.push(...value.slice(0, -1));
      if (value.length > 0) {
        streaming.push(value[value.length - 1]);
      }
    }

    baseStatus.completedItems = completed;
    baseStatus.streamingItems = streaming;
  } else if (typeof value === "object" && value !== null) {
    for (const [key, nestedValue] of Object.entries(value)) {
      const nestedPath = `${path}.${key}`;
      baseStatus[key] = buildNestedStatus(
        nestedValue,
        nestedPath,
        startedProps,
        isStreamingDone,
        isComponentStreaming,
      );
    }
  }

  return baseStatus;
}

/**
 * Track streaming status for individual props by monitoring their values.
 * Monitors when props receive their first token and when they complete streaming.
 * Supports nested objects and arrays with granular tracking.
 * @template Props - The type of the component props being tracked
 * @param props - The current component props object
 * @param componentStreamingState - The current streaming state of the component
 * @returns A record mapping each prop key to its PropStatus (with nested tracking)
 */
function usePropsStreamingStatus<Props extends object>(
  props: Props | undefined,
  componentStreamingState: TamboComponentContent["streamingState"] | undefined,
): NestedPropStatus<Props> {
  /** Track which props and nested paths have received content */
  const [startedProps, setStartedProps] = useState(new Set<string>());

  /** Recursively collect all paths that have received content */
  const collectStartedPaths = useMemo(() => {
    return (obj: unknown, prefix = ""): Set<string> => {
      const paths = new Set<string>();

      if (!obj || typeof obj !== "object") {
        if (hasContent(obj)) {
          paths.add(prefix);
        }
        return paths;
      }

      if (Array.isArray(obj)) {
        if (obj.length > 0) {
          paths.add(prefix);
        }
        return paths;
      }

      let objHasContent = false;
      for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (hasContent(value)) {
          paths.add(path);
          objHasContent = true;

          if (typeof value === "object" && value !== null) {
            const nestedPaths = collectStartedPaths(value, path);
            nestedPaths.forEach((p) => paths.add(p));
          }
        }
      }

      if (objHasContent && prefix) {
        paths.add(prefix);
      }

      return paths;
    };
  }, []);

  /** Update started props when content arrives */
  useEffect(() => {
    if (!props) return;

    const newPaths = collectStartedPaths(props);
    setStartedProps((prev) => {
      const combined = new Set([...prev, ...newPaths]);
      if (combined.size === prev.size) return prev;
      return combined;
    });
  }, [props, collectStartedPaths]);

  /** Derive prop statuses from started props and streaming state */
  return useMemo(() => {
    if (!props) return {} as NestedPropStatus<Props>;

    const isStreamingDone = componentStreamingState === "done";
    const isComponentStreaming = componentStreamingState === "streaming";

    const result = {} as NestedPropStatus<Props>;
    for (const key of Object.keys(props)) {
      const value = props[key as keyof Props];
      result[key as keyof Props] = buildNestedStatus(
        value,
        key,
        startedProps,
        isStreamingDone,
        isComponentStreaming,
      ) as PropStatus &
        (Props[keyof Props] extends object
          ? Props[keyof Props] extends unknown[]
            ? Record<string, never>
            : NestedPropStatus<Props[keyof Props]>
          : Record<string, never>);
    }
    return result;
  }, [props, startedProps, componentStreamingState]);
}

/**
 * Recursively extracts all PropStatus objects from a nested status structure.
 * @param status - A PropStatus object that may contain nested statuses
 * @returns Array of all PropStatus objects found
 */
function extractAllPropStatuses(status: unknown): PropStatus[] {
  if (!status || typeof status !== "object") return [];

  const statuses: PropStatus[] = [];

  const obj = status as Record<string, unknown>;
  if (
    "isPending" in obj &&
    "isStreaming" in obj &&
    "isSuccess" in obj &&
    typeof obj.isPending === "boolean" &&
    typeof obj.isStreaming === "boolean" &&
    typeof obj.isSuccess === "boolean"
  ) {
    statuses.push(obj as PropStatus);
  }

  for (const [key, value] of Object.entries(obj)) {
    if (
      key !== "isPending" &&
      key !== "isStreaming" &&
      key !== "isSuccess" &&
      key !== "error" &&
      key !== "completedItems" &&
      key !== "streamingItems" &&
      typeof value === "object" &&
      value !== null
    ) {
      statuses.push(...extractAllPropStatuses(value));
    }
  }

  return statuses;
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
function deriveGlobalStreamStatus<Props extends object>(
  componentStreamingState: TamboComponentContent["streamingState"] | undefined,
  propStatus: NestedPropStatus<Props>,
  hasComponent: boolean,
  streamError?: Error,
): StreamStatus {
  const allPropStatuses: PropStatus[] = [];
  for (const value of Object.values(propStatus)) {
    if (value) {
      allPropStatuses.push(...extractAllPropStatuses(value));
    }
  }

  const isStreamError = !!streamError;

  const allPropsSuccessful =
    allPropStatuses.length > 0 && allPropStatuses.every((p) => p.isSuccess);

  const isComponentStreaming = componentStreamingState === "streaming";
  const anyPropStreaming = allPropStatuses.some((p) => p.isStreaming);

  /** Find first error from stream or any prop */
  const firstError = streamError ?? allPropStatuses.find((p) => p.error)?.error;

  return {
    /** isPending: no component yet OR (not streaming, not error, not success, and all props pending) */
    isPending:
      !hasComponent ||
      (!isStreamError &&
        !isComponentStreaming &&
        !allPropsSuccessful &&
        allPropStatuses.every((p) => p.isPending)),

    /** isStreaming: component is streaming OR any prop is streaming (but not if error) */
    isStreaming: !isStreamError && (isComponentStreaming || anyPropStreaming),

    /** isSuccess: all props successful and no error */
    isSuccess: allPropsSuccessful && !isStreamError,

    /** isError: stream error OR any prop error */
    isError: isStreamError || allPropStatuses.some((p) => p.error),

    streamError: firstError,
  };
}

/**
 * Track streaming status for Tambo component props.
 *
 * **Important**: Props update repeatedly during streaming and may be partial.
 * Use `propStatus.<field>?.isSuccess` before treating a prop as complete.
 *
 * **New in this version**: Supports nested objects and arrays:
 * - Access nested object status: `propStatus.user?.name?.isStreaming`
 * - Access array items: `propStatus.items?.completedItems`
 *
 * Pair with `useTamboComponentState` to disable inputs while streaming.
 * @see {@link https://docs.tambo.co/concepts/generative-interfaces/component-state}
 * @template Props - Component props type
 * @returns `streamStatus` (overall) and `propStatus` (per-prop with nesting) flags
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
 *   return <Skeleton />;
 * }
 * ```
 * @example
 * ```tsx
 * // Display completed array items during streaming
 * const { propStatus } = useTamboStreamStatus<{ items: string[] }>();
 * const completedItems = propStatus.items?.completedItems || [];
 * return <ul>{completedItems.map(item => <li key={item}>{item}</li>)}</ul>;
 * ```
 */
export function useTamboStreamStatus<
  Props extends object = Record<string, unknown>,
>(): {
  streamStatus: StreamStatus;
  propStatus: NestedPropStatus<Props>;
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
