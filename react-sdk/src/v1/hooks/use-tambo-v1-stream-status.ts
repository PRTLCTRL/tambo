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
 *
 * For nested objects, contains recursive PropStatus for each nested field.
 * For arrays, contains completedItems and streamingItems in addition to standard flags.
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
   * Only present when the prop is an array.
   */
  completedItems?: unknown[];

  /**
   * For array props: items currently being streamed.
   * Only present when the prop is an array.
   */
  streamingItems?: unknown[];

  /**
   * For object props: nested streaming status for each field.
   * Allows tracking status of deeply nested properties.
   * Access like: propStatus.user.name.isStreaming
   */
  [key: string]: unknown;
}

/**
 * Check if a value is a plain object (not an array, not null, not a class instance).
 * @param value - Value to check
 * @returns True if value is a plain object
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    value.constructor === Object
  );
}

/**
 * Check if a value has meaningful content (not empty).
 * For primitives, checks if not undefined/null/empty string.
 * For arrays, checks if has any items with content.
 * For objects, recursively checks if any nested value has content.
 * @param value - Value to check
 * @returns True if value has content
 */
function hasContent(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return false;

  if (Array.isArray(value)) {
    return value.length > 0 && value.some((item) => hasContent(item));
  }

  if (isPlainObject(value)) {
    return Object.values(value).some((v) => hasContent(v));
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  return true;
}

/**
 * Build a flat path map of all properties that have started streaming.
 * Tracks nested paths like "user.name" and "items[0]".
 * @param obj - Object to traverse
 * @param prefix - Current path prefix
 * @param result - Accumulator for paths
 */
function buildStartedPathMap(
  obj: unknown,
  prefix: string,
  result: Set<string>,
): void {
  if (!hasContent(obj)) return;

  if (Array.isArray(obj)) {
    result.add(prefix);
    obj.forEach((item, index) => {
      if (hasContent(item)) {
        const itemPath = `${prefix}[${index}]`;
        result.add(itemPath);
        if (isPlainObject(item)) {
          buildStartedPathMap(item, itemPath, result);
        }
      }
    });
  } else if (isPlainObject(obj)) {
    result.add(prefix);
    for (const [key, value] of Object.entries(obj)) {
      if (hasContent(value)) {
        const childPath = prefix ? `${prefix}.${key}` : key;
        buildStartedPathMap(value, childPath, result);
      }
    }
  } else {
    result.add(prefix);
  }
}

/**
 * Create PropStatus for a single value with nested/array tracking.
 * @param value - The prop value
 * @param path - Path to this value (for tracking started state)
 * @param startedPaths - Set of paths that have started streaming
 * @param isStreamingDone - Whether component streaming is complete
 * @param isComponentStreaming - Whether component is actively streaming
 * @returns PropStatus for this value
 */
function createPropStatus(
  value: unknown,
  path: string,
  startedPaths: Set<string>,
  isStreamingDone: boolean,
  isComponentStreaming: boolean,
): PropStatus {
  const hasStarted = startedPaths.has(path);
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

    value.forEach((item, index) => {
      const itemPath = `${path}[${index}]`;
      const itemHasStarted = startedPaths.has(itemPath);

      if (isStreamingDone || !isComponentStreaming) {
        if (itemHasStarted) {
          completedItems.push(item);
        }
      } else {
        if (itemHasStarted) {
          streamingItems.push(item);
        }
      }
    });

    if (isStreamingDone) {
      baseStatus.completedItems = value;
      baseStatus.streamingItems = [];
    } else {
      baseStatus.completedItems = completedItems;
      baseStatus.streamingItems = streamingItems;
    }
  } else if (isPlainObject(value)) {
    for (const [key, childValue] of Object.entries(value)) {
      const childPath = `${path}.${key}`;
      (baseStatus as Record<string, unknown>)[key] = createPropStatus(
        childValue,
        childPath,
        startedPaths,
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
 * Supports nested objects and arrays with granular status tracking.
 * @template Props - The type of the component props being tracked
 * @param props - The current component props object
 * @param componentStreamingState - The current streaming state of the component
 * @returns A record mapping each prop key to its PropStatus (with nested status for objects/arrays)
 */
function usePropsStreamingStatus<Props extends object>(
  props: Props | undefined,
  componentStreamingState: TamboComponentContent["streamingState"] | undefined,
): Partial<Record<keyof Props, PropStatus>> {
  /** Track which prop paths have received content (including nested paths) */
  const [startedPaths, setStartedPaths] = useState(new Set<string>());

  /** Update started paths when content arrives */
  useEffect(() => {
    if (!props) return;

    setStartedPaths((prev) => {
      const newStarted = new Set<string>();
      for (const [key, value] of Object.entries(props)) {
        buildStartedPathMap(value, key, newStarted);
      }

      const changed =
        prev.size !== newStarted.size ||
        [...newStarted].some((path) => !prev.has(path));

      return changed ? newStarted : prev;
    });
  }, [props]);

  /** Derive prop statuses from started paths and streaming state */
  return useMemo(() => {
    if (!props) return {} as Record<keyof Props, PropStatus>;

    const isStreamingDone = componentStreamingState === "done";
    const isComponentStreaming = componentStreamingState === "streaming";

    const result = {} as Record<keyof Props, PropStatus>;
    for (const [key, value] of Object.entries(props)) {
      result[key as keyof Props] = createPropStatus(
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
