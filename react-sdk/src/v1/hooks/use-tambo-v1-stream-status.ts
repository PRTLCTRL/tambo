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
   * For array props: items that have completed streaming.
   * Only populated when the prop is an array.
   */
  completedItems?: unknown[];

  /**
   * For array props: items currently streaming or pending.
   * Only populated when the prop is an array.
   */
  streamingItems?: unknown[];
}

/**
 * Nested property status type for object properties.
 * When a prop is an object, its nested properties are tracked individually.
 */
export type NestedPropStatus<T> = T extends (infer U)[]
  ? PropStatus & {
      completedItems?: U[];
      streamingItems?: U[];
    }
  : T extends object
    ? PropStatus & {
        [K in keyof T]?: NestedPropStatus<T[K]>;
      }
    : PropStatus;

/**
 * Checks if a value has content (not empty).
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
 * Recursively builds nested prop status for an object or array.
 * @param value - The prop value to analyze
 * @param path - The path to this value (for tracking started state)
 * @param startedProps - Set of paths that have received content
 * @param isStreamingDone - Whether component streaming is complete
 * @param isComponentStreaming - Whether component is currently streaming
 * @returns The nested prop status
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

    value.forEach((item, index) => {
      const itemPath = `${path}[${index}]`;
      const itemStarted = startedProps.has(itemPath);

      if (itemStarted && isStreamingDone) {
        completedItems.push(item);
      } else if (itemStarted || isComponentStreaming) {
        streamingItems.push(item);
      }
    });

    return {
      ...baseStatus,
      completedItems: isStreamingDone ? value : completedItems,
      streamingItems,
    };
  }

  if (value !== null && typeof value === "object") {
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
 * Track streaming status for individual props by monitoring their values.
 * Monitors when props receive their first token and when they complete streaming.
 * Supports nested objects and arrays with granular status tracking.
 * @template Props - The type of the component props being tracked
 * @param props - The current component props object
 * @param componentStreamingState - The current streaming state of the component
 * @returns A record mapping each prop key to its nested PropStatus
 */
function usePropsStreamingStatus<Props extends object>(
  props: Props | undefined,
  componentStreamingState: TamboComponentContent["streamingState"] | undefined,
): Partial<Record<keyof Props, NestedPropStatus<Props[keyof Props]>>> {
  /** Track which prop paths have received content */
  const [startedProps, setStartedProps] = useState(new Set<string>());

  /** Recursively track started paths for nested objects and arrays */
  const trackStartedPaths = useMemo(() => {
    function traverse(
      obj: unknown,
      path: string,
      started: Set<string>,
    ): Set<string> {
      if (!hasContent(obj)) {
        return started;
      }

      started.add(path);

      if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
          traverse(item, `${path}[${index}]`, started);
        });
      } else if (obj !== null && typeof obj === "object") {
        for (const [key, value] of Object.entries(obj)) {
          traverse(value, `${path}.${key}`, started);
        }
      }

      return started;
    }

    return traverse;
  }, []);

  /** Update started props when content arrives */
  useEffect(() => {
    if (!props) return;

    setStartedProps((prev) => {
      const newStarted = new Set<string>();

      for (const [key, value] of Object.entries(props)) {
        trackStartedPaths(value, key, newStarted);
      }

      const changed =
        newStarted.size !== prev.size ||
        Array.from(newStarted).some((path) => !prev.has(path));

      return changed ? newStarted : prev;
    });
  }, [props, trackStartedPaths]);

  /** Derive prop statuses from started props and streaming state */
  return useMemo(() => {
    if (!props) return {} as Record<keyof Props, NestedPropStatus<Props[keyof Props]>>;

    const isStreamingDone = componentStreamingState === "done";
    const isComponentStreaming = componentStreamingState === "streaming";

    const result = {} as Record<keyof Props, NestedPropStatus<Props[keyof Props]>>;

    for (const [key, value] of Object.entries(props)) {
      result[key as keyof Props] = buildNestedPropStatus(
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
 * Extracts base PropStatus flags from potentially nested status objects.
 * @param status - The status object (may be nested)
 * @returns Base PropStatus flags
 */
function extractBasePropStatus(status: PropStatus): PropStatus {
  return {
    isPending: status.isPending,
    isStreaming: status.isStreaming,
    isSuccess: status.isSuccess,
    error: status.error,
  };
}

/**
 * Derives global StreamStatus from component streaming state and individual prop statuses.
 * Aggregates individual prop states into a unified stream status.
 * @template Props - The type of the component props
 * @param componentStreamingState - The current streaming state of the component
 * @param propStatus - Status record for each individual prop (may contain nested statuses)
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
  const propStatuses: PropStatus[] = Object.values(propStatus)
    .filter((p): p is PropStatus => p !== undefined)
    .map(extractBasePropStatus);

  const isStreamError = !!streamError;

  const allPropsSuccessful =
    propStatuses.length > 0 && propStatuses.every((p) => p.isSuccess);

  const isComponentStreaming = componentStreamingState === "streaming";
  const anyPropStreaming = propStatuses.some((p) => p.isStreaming);

  const firstError = streamError ?? propStatuses.find((p) => p.error)?.error;

  return {
    isPending:
      !hasComponent ||
      (!isStreamError &&
        !isComponentStreaming &&
        !allPropsSuccessful &&
        propStatuses.every((p) => p.isPending)),

    isStreaming: !isStreamError && (isComponentStreaming || anyPropStreaming),

    isSuccess: allPropsSuccessful && !isStreamError,

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
 * Supports nested object tracking and array tracking:
 * - For nested objects: `propStatus.user?.name?.isStreaming`
 * - For arrays: `propStatus.items?.completedItems` and `propStatus.items?.streamingItems`
 *
 * Pair with `useTamboComponentState` to disable inputs while streaming.
 * @see {@link https://docs.tambo.co/concepts/generative-interfaces/component-state}
 * @template Props - Component props type
 * @returns `streamStatus` (overall) and `propStatus` (per-prop with nesting support) flags
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
 * // Track nested object properties
 * const { propStatus } = useTamboStreamStatus<{ user: { name: string; email: string } }>();
 * <div className={propStatus.user?.name?.isStreaming ? "animate-pulse" : ""}>
 *   {user.name}
 * </div>
 * ```
 * @example
 * ```tsx
 * // Track array items
 * const { propStatus } = useTamboStreamStatus<{ items: string[] }>();
 * const completed = propStatus.items?.completedItems || [];
 * <ul>{completed.map((item, i) => <li key={i}>{item}</li>)}</ul>
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
