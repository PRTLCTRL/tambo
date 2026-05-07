"use client";

/**
 * useTamboStreamStatus - Stream Status Hook
 *
 * Provides granular streaming status for components being rendered,
 * allowing UI to respond to prop-level streaming states.
 *
 * Must be used within a component rendered via the component renderer.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
 * For nested objects, each nested field gets its own PropStatus.
 * For arrays, includes `completedItems` and `streamingItems` arrays.
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
   * Only present when the prop is an array.
   */
  completedItems?: unknown[];

  /**
   * For array props: items currently streaming (last item in array).
   * Only present when the prop is an array.
   */
  streamingItems?: unknown[];

  /**
   * For object props: nested PropStatus for each property.
   * Allows tracking streaming status of nested fields like propStatus.user.name.isStreaming
   */
  [key: string]: PropStatus | boolean | Error | unknown[] | undefined;
}

/**
 * Check if a value represents "started" content.
 * Empty strings, null, and undefined are considered "not started".
 * Empty arrays/objects are considered "started" because they've been initialized.
 * @param value - Value to check
 * @returns True if the value has received content
 */
function hasContent(value: unknown): boolean {
  if (value === undefined || value === null || value === "") {
    return false;
  }
  return true;
}

/**
 * Build nested PropStatus for an object value.
 * Recursively processes nested objects and arrays.
 * @param obj - Object to process
 * @param startedKeys - Set of keys that have received content
 * @param isStreamingDone - Whether component streaming is complete
 * @param isComponentStreaming - Whether component is currently streaming
 * @param pathPrefix - Path prefix for nested keys (e.g., "user." for user.name)
 * @returns PropStatus with nested status fields
 */
function buildNestedPropStatus(
  obj: Record<string, unknown>,
  startedKeys: Set<string>,
  isStreamingDone: boolean,
  isComponentStreaming: boolean,
  pathPrefix = "",
): PropStatus {
  const status: PropStatus = {
    isPending: false,
    isStreaming: false,
    isSuccess: false,
    error: undefined,
  };

  let anyChildStarted = false;
  let anyChildStreaming = false;
  let allChildrenComplete = true;

  for (const [key, value] of Object.entries(obj)) {
    const fullPath = pathPrefix + key;
    const keyStarted = startedKeys.has(fullPath);

    if (keyStarted) {
      anyChildStarted = true;
    }

    const keyComplete = keyStarted && isStreamingDone;

    if (!keyComplete) {
      allChildrenComplete = false;
    }

    if (keyStarted && !keyComplete && isComponentStreaming) {
      anyChildStreaming = true;
    }

    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length > 0
    ) {
      status[key] = buildNestedPropStatus(
        value as Record<string, unknown>,
        startedKeys,
        isStreamingDone,
        isComponentStreaming,
        fullPath + ".",
      );
    } else {
      status[key] = {
        isPending: !keyStarted && !keyComplete,
        isStreaming: keyStarted && !keyComplete && isComponentStreaming,
        isSuccess: keyComplete,
        error: undefined,
      };
    }
  }

  status.isPending = !anyChildStarted && !isStreamingDone;
  status.isStreaming = anyChildStreaming;
  status.isSuccess = allChildrenComplete && isStreamingDone;

  return status;
}

/**
 * Build PropStatus for an array value with completedItems and streamingItems.
 * @param arr - Array to process
 * @param hasStarted - Whether the array prop has received content
 * @param isStreamingDone - Whether component streaming is complete
 * @param isComponentStreaming - Whether component is currently streaming
 * @returns PropStatus with completedItems and streamingItems
 */
function buildArrayPropStatus(
  arr: unknown[],
  hasStarted: boolean,
  isStreamingDone: boolean,
  isComponentStreaming: boolean,
): PropStatus {
  const isComplete = hasStarted && isStreamingDone;

  let completedItems: unknown[] = [];
  let streamingItems: unknown[] = [];

  if (hasStarted && !isStreamingDone && isComponentStreaming && arr.length > 0) {
    completedItems = arr.slice(0, -1);
    streamingItems = [arr[arr.length - 1]];
  } else if (isComplete) {
    completedItems = arr;
    streamingItems = [];
  }

  return {
    isPending: !hasStarted && !isComplete,
    isStreaming: hasStarted && !isComplete && isComponentStreaming,
    isSuccess: isComplete,
    error: undefined,
    completedItems,
    streamingItems,
  };
}

/**
 * Track streaming status for individual props by monitoring their values.
 * Monitors when props receive their first token and when they complete streaming.
 * Supports nested objects and arrays with completedItems/streamingItems tracking.
 * @template Props - The type of the component props being tracked
 * @param props - The current component props object
 * @param componentStreamingState - The current streaming state of the component
 * @returns A record mapping each prop key to its PropStatus
 */
function usePropsStreamingStatus<Props extends object>(
  props: Props | undefined,
  componentStreamingState: TamboComponentContent["streamingState"] | undefined,
): Partial<Record<keyof Props, PropStatus>> {
  /** Track which props and nested paths have received content */
  const [startedKeys, setStartedKeys] = useState(new Set<string>());

  /** Recursively collect all keys that have content */
  const collectStartedKeys = useCallback((
    obj: Record<string, unknown>,
    pathPrefix = "",
  ): Set<string> => {
    const started = new Set<string>();

    for (const [key, value] of Object.entries(obj)) {
      const fullPath = pathPrefix + key;

      if (hasContent(value)) {
        started.add(fullPath);

        if (
          value !== null &&
          typeof value === "object" &&
          !Array.isArray(value)
        ) {
          const nestedKeys = collectStartedKeys(
            value as Record<string, unknown>,
            fullPath + ".",
          );
          nestedKeys.forEach((k) => started.add(k));
        }
      }
    }

    return started;
  }, []);

  /** Update started keys when content arrives */
  useEffect(() => {
    if (!props) return;

    setStartedKeys((prev) => {
      const newStarted = collectStartedKeys(
        props as Record<string, unknown>,
      );

      const changed =
        prev.size !== newStarted.size ||
        Array.from(newStarted).some((k) => !prev.has(k));

      return changed ? newStarted : prev;
    });
  }, [props, collectStartedKeys]);

  /** Derive prop statuses from started keys and streaming state */
  return useMemo(() => {
    if (!props) return {} as Record<keyof Props, PropStatus>;

    const isStreamingDone = componentStreamingState === "done";
    const isComponentStreaming = componentStreamingState === "streaming";

    const result = {} as Record<keyof Props, PropStatus>;

    for (const [key, value] of Object.entries(props)) {
      const keyStarted = startedKeys.has(key);
      const keyComplete = keyStarted && isStreamingDone;

      if (Array.isArray(value)) {
        result[key as keyof Props] = buildArrayPropStatus(
          value,
          keyStarted,
          isStreamingDone,
          isComponentStreaming,
        );
      } else if (
        value !== null &&
        typeof value === "object" &&
        Object.keys(value).length > 0
      ) {
        result[key as keyof Props] = buildNestedPropStatus(
          value as Record<string, unknown>,
          startedKeys,
          isStreamingDone,
          isComponentStreaming,
          key + ".",
        );
      } else {
        result[key as keyof Props] = {
          isPending: !keyStarted && !keyComplete,
          isStreaming: keyStarted && !keyComplete && isComponentStreaming,
          isSuccess: keyComplete,
          error: undefined,
        };
      }
    }

    return result;
  }, [props, startedKeys, componentStreamingState]);
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
 * **Nested Objects**: For props with nested objects, propStatus includes nested
 * status fields. Access with `propStatus.user.name.isStreaming`.
 *
 * **Arrays**: For array props, propStatus includes `completedItems` and `streamingItems`
 * arrays to access only the items that have finished streaming.
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
 * const { propStatus } = useTamboStreamStatus<{ user: { name: string, email: string } }>();
 * <div>
 *   <span className={propStatus.user?.name?.isStreaming ? "animate-pulse" : ""}>
 *     {props.user?.name}
 *   </span>
 * </div>
 * ```
 * @example
 * ```tsx
 * // Show only completed array items
 * const { propStatus } = useTamboStreamStatus<{ items: string[] }>();
 * const completed = propStatus.items?.completedItems as string[] ?? [];
 * return <ul>{completed.map(item => <li key={item}>{item}</li>)}</ul>;
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
