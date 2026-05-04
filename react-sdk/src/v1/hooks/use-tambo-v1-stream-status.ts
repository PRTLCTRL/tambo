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
   * For array props, contains the items that have finished streaming.
   * Only present when the prop is an array.
   */
  completedItems?: unknown[];

  /**
   * For array props, contains the items currently streaming.
   * Only present when the prop is an array.
   */
  streamingItems?: unknown[];
}

/**
 * Recursively builds nested PropStatus for objects and arrays.
 * Objects get nested PropStatus for each property.
 * Arrays get completedItems and streamingItems in addition to their own status.
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
 * Helper to check if a value has content (not empty).
 * For objects and arrays, recursively checks for actual content.
 * @param value - Value to check
 * @returns True if value has content
 */
function hasContent(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return false;

  if (Array.isArray(value)) {
    return value.length > 0 && value.some((item) => hasContent(item));
  }

  if (typeof value === "object") {
    return Object.values(value).some((v) => hasContent(v));
  }

  return true;
}

/**
 * Helper to create nested PropStatus for objects and arrays recursively.
 * @param value - The current value
 * @param path - Path to this value (for tracking started state)
 * @param startedProps - Set of paths that have started
 * @param isStreamingDone - Whether component streaming is complete
 * @param isComponentStreaming - Whether component is currently streaming
 * @returns PropStatus with nested structure if applicable
 */
function createNestedPropStatus(
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
      const itemHasStarted = startedProps.has(itemPath);
      const itemIsComplete = itemHasStarted && isStreamingDone;

      if (itemIsComplete) {
        completedItems.push(item);
      } else if (itemHasStarted && isComponentStreaming) {
        streamingItems.push(item);
      }
    });

    return {
      ...baseStatus,
      completedItems,
      streamingItems,
    };
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const nested: Record<string, PropStatus> = {};

    for (const [key, childValue] of Object.entries(value)) {
      const childPath = `${path}.${key}`;
      nested[key] = createNestedPropStatus(
        childValue,
        childPath,
        startedProps,
        isStreamingDone,
        isComponentStreaming,
      );
    }

    return {
      ...baseStatus,
      ...nested,
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
 * @returns A record mapping each prop key to its NestedPropStatus
 */
function usePropsStreamingStatus<Props extends object>(
  props: Props | undefined,
  componentStreamingState: TamboComponentContent["streamingState"] | undefined,
): Partial<Record<keyof Props, NestedPropStatus<Props[keyof Props]>>> {
  /** Track which prop paths have received content */
  const [startedProps, setStartedProps] = useState(new Set<string>());

  /** Recursively track all paths that have content */
  const trackPaths = useRef((obj: unknown, basePath = ""): Set<string> => {
    const paths = new Set<string>();

    if (!obj || typeof obj !== "object") {
      if (hasContent(obj) && basePath) {
        paths.add(basePath);
      }
      return paths;
    }

    if (Array.isArray(obj)) {
      if (basePath && hasContent(obj)) {
        paths.add(basePath);
      }
      obj.forEach((item, index) => {
        const itemPath = basePath ? `${basePath}[${index}]` : `[${index}]`;
        if (hasContent(item)) {
          paths.add(itemPath);
          const childPaths = trackPaths.current(item, itemPath);
          childPaths.forEach((p) => paths.add(p));
        }
      });
      return paths;
    }

    if (basePath && hasContent(obj)) {
      paths.add(basePath);
    }

    for (const [key, value] of Object.entries(obj)) {
      const path = basePath ? `${basePath}.${key}` : key;
      if (hasContent(value)) {
        paths.add(path);
        const childPaths = trackPaths.current(value, path);
        childPaths.forEach((p) => paths.add(p));
      }
    }

    return paths;
  });

  /** Update started props when content arrives */
  useEffect(() => {
    if (!props) return;

    setStartedProps((prev) => {
      const newPaths = trackPaths.current(props);
      const combined = new Set([...prev, ...newPaths]);

      if (combined.size === prev.size) return prev;
      return combined;
    });
  }, [props]);

  /** Derive prop statuses from started props and streaming state */
  return useMemo(() => {
    if (!props)
      return {} as Record<keyof Props, NestedPropStatus<Props[keyof Props]>>;

    const isStreamingDone = componentStreamingState === "done";
    const isComponentStreaming = componentStreamingState === "streaming";

    const result = {} as Record<
      keyof Props,
      NestedPropStatus<Props[keyof Props]>
    >;
    for (const key of Object.keys(props)) {
      const value = props[key as keyof Props];
      result[key as keyof Props] = createNestedPropStatus(
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
 * Recursively extract all PropStatus objects from nested structure.
 * @param propStatus - The potentially nested prop status
 * @returns Flat array of all PropStatus objects
 */
function flattenPropStatuses(propStatus: unknown): PropStatus[] {
  if (!propStatus || typeof propStatus !== "object") return [];

  const statuses: PropStatus[] = [];

  if ("isPending" in propStatus && "isStreaming" in propStatus) {
    statuses.push(propStatus as PropStatus);
  }

  for (const value of Object.values(propStatus)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      statuses.push(...flattenPropStatuses(value));
    }
  }

  return statuses;
}

/**
 * Derives global StreamStatus from component streaming state and individual prop statuses.
 * Aggregates individual prop states into a unified stream status.
 * @template Props - The type of the component props
 * @param componentStreamingState - The current streaming state of the component
 * @param propStatus - Status record for each individual prop (may be nested)
 * @param hasComponent - Whether a component exists in the current message
 * @param streamError - Any error from the streaming process itself
 * @returns The aggregated StreamStatus for the entire component
 */
function deriveGlobalStreamStatus(
  componentStreamingState: TamboComponentContent["streamingState"] | undefined,
  propStatus: Partial<Record<string, unknown>>,
  hasComponent: boolean,
  streamError?: Error,
): StreamStatus {
  const topLevelStatuses = Object.values(propStatus).filter(
    (p): p is PropStatus =>
      p !== null &&
      p !== undefined &&
      typeof p === "object" &&
      "isPending" in p,
  );

  const allPropStatuses = topLevelStatuses.flatMap((status) =>
    flattenPropStatuses(status),
  );

  const propStatuses =
    allPropStatuses.length > 0 ? allPropStatuses : topLevelStatuses;

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
 * Supports nested objects and arrays with granular status tracking.
 * For nested objects, access status via `propStatus.parent?.child?.isStreaming`.
 * For arrays, use `propStatus.arrayField?.completedItems` and `propStatus.arrayField?.streamingItems`.
 *
 * Pair with `useTamboComponentState` to disable inputs while streaming.
 * @see {@link https://docs.tambo.co/concepts/generative-interfaces/component-state}
 * @template Props - Component props type
 * @returns `streamStatus` (overall) and `propStatus` (per-prop with nested structure) flags
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
 * // Track nested object status
 * const { propStatus } = useTamboStreamStatus<{ user: { name: string; email: string } }>();
 * <div>
 *   <span className={propStatus.user?.name?.isStreaming ? "animate-pulse" : ""}>
 *     {user.name}
 *   </span>
 * </div>
 * ```
 * @example
 * ```tsx
 * // Use completed array items
 * const { propStatus } = useTamboStreamStatus<{ items: string[] }>();
 * <ul>
 *   {propStatus.items?.completedItems?.map((item) => (
 *     <li key={item}>{item}</li>
 *   ))}
 * </ul>
 * ```
 */
export function useTamboStreamStatus<
  Props extends object = Record<string, unknown>,
>(): {
  streamStatus: StreamStatus;
  propStatus: Partial<
    Record<keyof Props, NestedPropStatus<Props[keyof Props]>>
  >;
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
