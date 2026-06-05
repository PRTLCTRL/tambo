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
 * For nested objects, contains nested PropStatus objects matching the prop structure.
 * For arrays, includes completedItems and streamingItems arrays.
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
   * Each item is fully streamed and stable.
   */
  completedItems?: unknown[];

  /**
   * For array props: items currently being streamed.
   * These items may be partial and still updating.
   */
  streamingItems?: unknown[];

  /**
   * For nested object props: status of nested properties.
   * Nested status objects match the structure of the prop.
   */
  [key: string]: boolean | Error | undefined | unknown[] | PropStatus;
}

/**
 * Check if a value is a plain object (not an array, not null, not a primitive).
 * @param value - The value to check
 * @returns True if the value is a plain object
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === "[object Object]"
  );
}

/**
 * Check if a value has started (non-empty content).
 * @param value - The value to check
 * @returns True if the value has content
 */
function hasContent(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

/**
 * Track streaming status for individual props by monitoring their values.
 * Monitors when props receive their first token and when they complete streaming.
 * Supports nested objects and array tracking.
 * @template Props - The type of the component props being tracked
 * @param props - The current component props object
 * @param componentStreamingState - The current streaming state of the component
 * @returns A record mapping each prop key to its PropStatus
 */
function usePropsStreamingStatus<Props extends object>(
  props: Props | undefined,
  componentStreamingState: TamboComponentContent["streamingState"] | undefined,
): Partial<Record<keyof Props, PropStatus>> {
  /** Track which props/paths have received content */
  const [startedPaths, setStartedPaths] = useState(new Set<string>());

  /** Update started paths when content arrives */
  useEffect(() => {
    if (!props) return;

    setStartedPaths((prev) => {
      let changed = false;
      const newStarted = new Set(prev);

      /**
       * Recursively check for content and update started paths.
       * @param obj - The object to check
       * @param path - The current path (e.g., "user.name")
       */
      function checkPaths(obj: Record<string, unknown>, path = "") {
        for (const [key, value] of Object.entries(obj)) {
          const currentPath = path ? `${path}.${key}` : key;

          if (hasContent(value) && !newStarted.has(currentPath)) {
            newStarted.add(currentPath);
            changed = true;
          }

          if (isPlainObject(value)) {
            checkPaths(value, currentPath);
          } else if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) {
              const itemPath = `${currentPath}[${i}]`;
              if (hasContent(value[i]) && !newStarted.has(itemPath)) {
                newStarted.add(itemPath);
                changed = true;
              }
            }
          }
        }
      }

      checkPaths(props as Record<string, unknown>);
      return changed ? newStarted : prev;
    });
  }, [props]);

  /** Derive prop statuses from started paths and streaming state */
  return useMemo(() => {
    if (!props) return {} as Record<keyof Props, PropStatus>;

    const isStreamingDone = componentStreamingState === "done";
    const isComponentStreaming = componentStreamingState === "streaming";

    /**
     * Build status for a value recursively.
     * @param value - The current value
     * @param path - The current path
     * @returns The PropStatus for this value
     */
    function buildStatus(value: unknown, path: string): PropStatus {
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

        for (let i = 0; i < value.length; i++) {
          const itemPath = `${path}[${i}]`;
          const itemStarted = startedPaths.has(itemPath);

          if (itemStarted && isStreamingDone) {
            completedItems.push(value[i]);
          } else if (itemStarted) {
            streamingItems.push(value[i]);
          }
        }

        return {
          ...baseStatus,
          completedItems,
          streamingItems,
        };
      }

      if (isPlainObject(value)) {
        const nested: Record<string, PropStatus> = {};

        for (const [key, nestedValue] of Object.entries(value)) {
          const nestedPath = `${path}.${key}`;
          nested[key] = buildStatus(nestedValue, nestedPath);
        }

        return {
          ...baseStatus,
          ...nested,
        };
      }

      return baseStatus;
    }

    const result = {} as Record<keyof Props, PropStatus>;
    for (const key of Object.keys(props)) {
      result[key as keyof Props] = buildStatus(props[key as keyof Props], key);
    }

    return result;
  }, [props, startedPaths, componentStreamingState]);
}

/**
 * Recursively collect all leaf PropStatus objects from a nested structure.
 * @param propStatus - The prop status object (possibly nested)
 * @returns Array of all leaf PropStatus objects
 */
function flattenPropStatuses(
  propStatus: Partial<Record<string, PropStatus>>,
): PropStatus[] {
  const result: PropStatus[] = [];

  function collect(status: PropStatus | Record<string, PropStatus>): void {
    if (!status || typeof status !== "object") return;

    const hasStatusFields =
      "isPending" in status &&
      "isStreaming" in status &&
      "isSuccess" in status;

    if (hasStatusFields) {
      result.push(status as PropStatus);
    }

    for (const [key, value] of Object.entries(status)) {
      if (
        key !== "isPending" &&
        key !== "isStreaming" &&
        key !== "isSuccess" &&
        key !== "error" &&
        key !== "completedItems" &&
        key !== "streamingItems" &&
        value &&
        typeof value === "object"
      ) {
        collect(value as PropStatus | Record<string, PropStatus>);
      }
    }
  }

  for (const value of Object.values(propStatus)) {
    if (value) collect(value);
  }

  return result;
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
  const propStatuses: PropStatus[] = flattenPropStatuses(propStatus);
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
