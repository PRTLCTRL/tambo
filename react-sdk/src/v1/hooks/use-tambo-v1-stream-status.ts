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
   * Each item is a complete, stable value from the array.
   */
  completedItems?: unknown[];

  /**
   * For array props: items currently being streamed.
   * These items may be partial and still updating.
   */
  streamingItems?: unknown[];
}

/**
 * Recursively build a nested PropStatus structure that mirrors the shape of the input props.
 * For objects: creates a nested structure with status at each level.
 * For arrays: creates status with completedItems and streamingItems.
 * For primitives: creates basic PropStatus.
 */
export type NestedPropStatus<T> = T extends (infer U)[]
  ? PropStatus & {
      completedItems: U[];
      streamingItems: U[];
    }
  : T extends object
    ? PropStatus & {
        [K in keyof T]?: NestedPropStatus<T[K]>;
      }
    : PropStatus;

/**
 * Check if a value has content (is not empty/null/undefined).
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
 * Build a path key for tracking nested properties.
 * @param basePath - The base path (can be empty string for root)
 * @param key - The key to append
 * @returns The full path key
 */
function buildPath(basePath: string, key: string): string {
  return basePath ? `${basePath}.${key}` : key;
}

/**
 * Recursively scan props to find all paths that have started streaming.
 * @param value - The current value to scan
 * @param basePath - The base path for this value
 * @param startedPaths - The set to populate with started paths
 */
function scanStartedPaths(
  value: unknown,
  basePath: string,
  startedPaths: Set<string>,
): void {
  if (!hasContent(value)) {
    return;
  }

  startedPaths.add(basePath);

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const itemPath = buildPath(basePath, String(index));
      scanStartedPaths(item, itemPath, startedPaths);
    });
  } else if (typeof value === "object" && value !== null) {
    for (const [key, childValue] of Object.entries(value)) {
      const childPath = buildPath(basePath, key);
      scanStartedPaths(childValue, childPath, startedPaths);
    }
  }
}

/**
 * Build nested PropStatus structure for a value.
 * @param value - The current value
 * @param basePath - The base path for this value
 * @param startedPaths - Set of paths that have started streaming
 * @param isStreamingDone - Whether component streaming is done
 * @param isComponentStreaming - Whether component is currently streaming
 * @returns The PropStatus for this value
 */
function buildNestedStatus(
  value: unknown,
  basePath: string,
  startedPaths: Set<string>,
  isStreamingDone: boolean,
  isComponentStreaming: boolean,
): PropStatus {
  const hasStarted = startedPaths.has(basePath);
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
    } else if (isComponentStreaming) {
      value.forEach((item, index) => {
        const itemPath = buildPath(basePath, String(index));
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
      ...baseStatus,
      completedItems,
      streamingItems,
    };
  }

  if (typeof value === "object" && value !== null) {
    const nestedStatus: PropStatus & Record<string, PropStatus> = {
      ...baseStatus,
    } as PropStatus & Record<string, PropStatus>;

    for (const [key, childValue] of Object.entries(value)) {
      const childPath = buildPath(basePath, key);
      nestedStatus[key] = buildNestedStatus(
        childValue,
        childPath,
        startedPaths,
        isStreamingDone,
        isComponentStreaming,
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
 * @returns A record mapping each prop key to its NestedPropStatus
 */
function usePropsStreamingStatus<Props extends object>(
  props: Props | undefined,
  componentStreamingState: TamboComponentContent["streamingState"] | undefined,
): Partial<Record<keyof Props, NestedPropStatus<Props[keyof Props]>>> {
  /** Track which paths (including nested ones) have received content */
  const [startedPaths, setStartedPaths] = useState(new Set<string>());

  /** Update started paths when content arrives */
  useEffect(() => {
    if (!props) return;

    setStartedPaths((prev) => {
      const newStarted = new Set<string>();

      for (const [key, value] of Object.entries(props)) {
        scanStartedPaths(value, key, newStarted);
      }

      const changed =
        newStarted.size !== prev.size ||
        Array.from(newStarted).some((path) => !prev.has(path));

      return changed ? newStarted : prev;
    });
  }, [props]);

  /** Derive prop statuses from started paths and streaming state */
  return useMemo(() => {
    if (!props)
      return {} as Record<keyof Props, NestedPropStatus<Props[keyof Props]>>;

    const isStreamingDone = componentStreamingState === "done";
    const isComponentStreaming = componentStreamingState === "streaming";

    const result = {} as Record<
      keyof Props,
      NestedPropStatus<Props[keyof Props]>
    >;

    for (const [key, value] of Object.entries(props)) {
      result[key as keyof Props] = buildNestedStatus(
        value,
        key,
        startedPaths,
        isStreamingDone,
        isComponentStreaming,
      ) as NestedPropStatus<Props[keyof Props]>;
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
 * **New**: Supports nested objects and arrays:
 * - Access nested status: `propStatus.user?.name?.isStreaming`
 * - Access array items: `propStatus.items?.completedItems`, `propStatus.items?.streamingItems`
 *
 * Pair with `useTamboComponentState` to disable inputs while streaming.
 * @see {@link https://docs.tambo.co/concepts/generative-interfaces/component-state}
 * @template Props - Component props type
 * @returns `streamStatus` (overall) and `propStatus` (per-prop with nested support) flags
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
 * // Highlight in-flight props (flat)
 * const { propStatus } = useTamboStreamStatus<Props>();
 * <h2 className={propStatus.title?.isStreaming ? "animate-pulse" : ""}>
 *   {title}
 * </h2>
 * ```
 * @example
 * ```tsx
 * // Track nested object streaming
 * const { propStatus } = useTamboStreamStatus<{ user: { name: string; email: string } }>();
 * <div>
 *   <h3 className={propStatus.user?.name?.isStreaming ? "animate-pulse" : ""}>
 *     {user.name}
 *   </h3>
 *   <p className={propStatus.user?.email?.isStreaming ? "animate-pulse" : ""}>
 *     {user.email}
 *   </p>
 * </div>
 * ```
 * @example
 * ```tsx
 * // Show completed array items while streaming continues
 * const { propStatus } = useTamboStreamStatus<{ items: Item[] }>();
 * return (
 *   <div>
 *     {propStatus.items?.completedItems?.map(item => <ItemCard key={item.id} {...item} />)}
 *     {propStatus.items?.streamingItems?.map(item => <ItemCard key={item.id} {...item} loading />)}
 *   </div>
 * );
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
