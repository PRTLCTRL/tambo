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
   * Only present when the prop is an array.
   */
  completedItems?: unknown[];

  /**
   * For array props: items currently being streamed.
   * Only present when the prop is an array.
   */
  streamingItems?: unknown[];

  /**
   * For nested object props: status of nested fields.
   * Allows tracking streaming status of deeply nested properties.
   */
  [key: string]:
    | boolean
    | Error
    | unknown[]
    | PropStatus
    | undefined;
}

/**
 * Recursively builds PropStatus for nested objects and arrays.
 * @param value - The current prop value
 * @param isStreamingDone - Whether component streaming is complete
 * @param isComponentStreaming - Whether component is actively streaming
 * @param startedProps - Set of property paths that have received content
 * @param path - Current property path (for nested tracking)
 * @returns PropStatus with nested structure
 */
function buildPropStatus(
  value: unknown,
  isStreamingDone: boolean,
  isComponentStreaming: boolean,
  startedProps: Set<string>,
  path: string,
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

    for (let i = 0; i < value.length; i++) {
      const itemPath = `${path}[${i}]`;
      const itemStarted = startedProps.has(itemPath);

      if (itemStarted && isStreamingDone) {
        completedItems.push(value[i]);
      } else if (itemStarted && !isStreamingDone && isComponentStreaming) {
        streamingItems.push(value[i]);
      }
    }

    return {
      ...baseStatus,
      completedItems: isStreamingDone ? value : completedItems,
      streamingItems: isStreamingDone ? [] : streamingItems,
    };
  }

  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    const nestedStatus = { ...baseStatus };

    for (const [key, nestedValue] of Object.entries(value)) {
      const nestedPath = `${path}.${key}`;
      nestedStatus[key] = buildPropStatus(
        nestedValue,
        isStreamingDone,
        isComponentStreaming,
        startedProps,
        nestedPath,
      );
    }

    return nestedStatus;
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
 * @returns A record mapping each prop key to its PropStatus
 */
function usePropsStreamingStatus<Props extends object>(
  props: Props | undefined,
  componentStreamingState: TamboComponentContent["streamingState"] | undefined,
): Partial<Record<keyof Props, PropStatus>> {
  /** Track which prop paths have received content */
  const [startedProps, setStartedProps] = useState(new Set<string>());

  /** Recursively track nested property paths */
  const trackNestedProps = (
    value: unknown,
    path: string,
    newStarted: Set<string>,
  ): boolean => {
    let changed = false;

    const hasContent = value !== undefined && value !== null && value !== "";
    if (hasContent && !newStarted.has(path)) {
      newStarted.add(path);
      changed = true;
    }

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const itemPath = `${path}[${i}]`;
        const itemHasContent =
          value[i] !== undefined && value[i] !== null && value[i] !== "";
        if (itemHasContent && !newStarted.has(itemPath)) {
          newStarted.add(itemPath);
          changed = true;
        }
      }
    } else if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      for (const [key, nestedValue] of Object.entries(value)) {
        const nestedPath = `${path}.${key}`;
        if (trackNestedProps(nestedValue, nestedPath, newStarted)) {
          changed = true;
        }
      }
    }

    return changed;
  };

  /** Update started props when content arrives */
  useEffect(() => {
    if (!props) return;

    setStartedProps((prev) => {
      let changed = false;
      const newStarted = new Set(prev);

      for (const [key, value] of Object.entries(props)) {
        if (trackNestedProps(value, key, newStarted)) {
          changed = true;
        }
      }

      return changed ? newStarted : prev;
    });
  }, [props]);

  /** Derive prop statuses from started props and streaming state */
  return useMemo(() => {
    if (!props) return {} as Record<keyof Props, PropStatus>;

    const isStreamingDone = componentStreamingState === "done";
    const isComponentStreaming = componentStreamingState === "streaming";

    const result = {} as Record<keyof Props, PropStatus>;
    for (const [key, value] of Object.entries(props)) {
      result[key as keyof Props] = buildPropStatus(
        value,
        isStreamingDone,
        isComponentStreaming,
        startedProps,
        key,
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
