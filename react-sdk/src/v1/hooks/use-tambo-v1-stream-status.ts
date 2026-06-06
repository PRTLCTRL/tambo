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
}

/**
 * Enhanced streaming status for array props.
 * Includes tracking of completed vs streaming items within the array.
 */
export interface ArrayPropStatus extends PropStatus {
  /**
   * Items that have finished streaming and are complete.
   * Only populated when streaming is done.
   */
  completedItems: unknown[];

  /**
   * Items currently being streamed.
   * Only populated during active streaming.
   */
  streamingItems: unknown[];
}

/**
 * Type that represents the nested structure of prop statuses.
 * For objects, creates a nested structure with status at each level.
 * For arrays, includes completedItems and streamingItems.
 */
export type NestedPropStatus<T> = T extends Array<infer U>
  ? ArrayPropStatus
  : T extends object
    ? PropStatus & {
        [K in keyof T]?: NestedPropStatus<T[K]>;
      }
    : PropStatus;

/**
 * Check if a value has meaningful content.
 * @param value - The value to check
 * @returns True if the value has content (not undefined, null, or empty string)
 */
function hasContent(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

/**
 * Create a path key for nested properties (e.g., "user.name" or "items[0]").
 * @param parentPath - The parent property path
 * @param key - The current property key or index
 * @returns A dot-notation path string
 */
function createPath(parentPath: string, key: string | number): string {
  if (parentPath === "") return String(key);
  return typeof key === "number"
    ? `${parentPath}[${key}]`
    : `${parentPath}.${key}`;
}

/**
 * Recursively collect all property paths from a nested object or array.
 * @param value - The value to traverse
 * @param path - The current path prefix
 * @param paths - Set to collect all discovered paths
 */
function collectPaths(value: unknown, path: string, paths: Set<string>): void {
  if (!hasContent(value)) return;

  paths.add(path);

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      collectPaths(value[i], createPath(path, i), paths);
    }
  } else if (typeof value === "object" && value !== null) {
    for (const [key, nestedValue] of Object.entries(value)) {
      collectPaths(nestedValue, createPath(path, key), paths);
    }
  }
}

/**
 * Build a nested status object from flat path tracking.
 * @template T - The type of the value being tracked
 * @param value - The current value
 * @param path - The current path prefix
 * @param startedPaths - Set of paths that have started streaming
 * @param isStreamingDone - Whether component streaming is complete
 * @param isComponentStreaming - Whether component is actively streaming
 * @returns The nested PropStatus structure
 */
function buildNestedStatus<T>(
  value: T,
  path: string,
  startedPaths: Set<string>,
  isStreamingDone: boolean,
  isComponentStreaming: boolean,
): NestedPropStatus<T> {
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

    if (isStreamingDone) {
      completedItems.push(...value);
    } else if (hasStarted) {
      for (let i = 0; i < value.length; i++) {
        const itemPath = createPath(path, i);
        const itemStarted = startedPaths.has(itemPath);
        if (itemStarted && isStreamingDone) {
          completedItems.push(value[i]);
        } else if (itemStarted) {
          streamingItems.push(value[i]);
        }
      }
    }

    return {
      ...baseStatus,
      completedItems,
      streamingItems,
    } as NestedPropStatus<T>;
  } else if (typeof value === "object" && value !== null) {
    const nested: Record<string, unknown> = { ...baseStatus };

    for (const key of Object.keys(value)) {
      const nestedValue = (value as Record<string, unknown>)[key];
      const nestedPath = createPath(path, key);
      nested[key] = buildNestedStatus(
        nestedValue,
        nestedPath,
        startedPaths,
        isStreamingDone,
        isComponentStreaming,
      );
    }

    return nested as NestedPropStatus<T>;
  }

  return baseStatus as NestedPropStatus<T>;
}

/**
 * Track streaming status for individual props by monitoring their values.
 * Monitors when props receive their first token and when they complete streaming.
 * Supports nested objects and arrays with granular tracking.
 * @template Props - The type of the component props being tracked
 * @param props - The current component props object
 * @param componentStreamingState - The current streaming state of the component
 * @returns A record mapping each prop key to its NestedPropStatus
 */
function usePropsStreamingStatus<Props extends object>(
  props: Props | undefined,
  componentStreamingState: TamboComponentContent["streamingState"] | undefined,
): Partial<Record<keyof Props, NestedPropStatus<Props[keyof Props]>>> {
  /** Track which property paths (including nested) have received content */
  const [startedPaths, setStartedPaths] = useState(new Set<string>());

  /** Update started paths when content arrives at any level */
  useEffect(() => {
    if (!props) return;

    setStartedPaths((prev) => {
      const newPaths = new Set<string>();

      for (const [key, value] of Object.entries(props)) {
        collectPaths(value, key, newPaths);
      }

      const changed =
        newPaths.size !== prev.size ||
        Array.from(newPaths).some((p) => !prev.has(p));

      return changed ? newPaths : prev;
    });
  }, [props]);

  /** Derive nested prop statuses from started paths and streaming state */
  return useMemo(() => {
    if (!props) return {} as Record<keyof Props, NestedPropStatus<Props[keyof Props]>>;

    const isStreamingDone = componentStreamingState === "done";
    const isComponentStreaming = componentStreamingState === "streaming";

    const result = {} as Record<keyof Props, NestedPropStatus<Props[keyof Props]>>;
    for (const key of Object.keys(props)) {
      const value = (props as Record<string, unknown>)[key];
      result[key as keyof Props] = buildNestedStatus(
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
 * Handles nested prop status structures by recursively collecting PropStatus flags.
 * @template Props - The type of the component props
 * @param componentStreamingState - The current streaming state of the component
 * @param propStatus - Status record for each individual prop (may be nested)
 * @param hasComponent - Whether a component exists in the current message
 * @param streamError - Any error from the streaming process itself
 * @returns The aggregated StreamStatus for the entire component
 */
function deriveGlobalStreamStatus<Props extends object>(
  componentStreamingState: TamboComponentContent["streamingState"] | undefined,
  propStatus: Partial<Record<keyof Props, NestedPropStatus<Props[keyof Props]>>>,
  hasComponent: boolean,
  streamError?: Error,
): StreamStatus {
  /**
   * Recursively collect all PropStatus objects from nested structure.
   * @param status - A PropStatus or nested structure containing PropStatus objects
   * @param collected - Array to collect all PropStatus objects
   */
  function collectPropStatuses(
    status: unknown,
    collected: PropStatus[],
  ): void {
    if (!status || typeof status !== "object") return;

    const obj = status as Record<string, unknown>;

    if (
      "isPending" in obj &&
      "isStreaming" in obj &&
      "isSuccess" in obj
    ) {
      collected.push({
        isPending: !!obj.isPending,
        isStreaming: !!obj.isStreaming,
        isSuccess: !!obj.isSuccess,
        error: obj.error as Error | undefined,
      });
    }

    for (const [key, value] of Object.entries(obj)) {
      if (
        key !== "isPending" &&
        key !== "isStreaming" &&
        key !== "isSuccess" &&
        key !== "error" &&
        key !== "completedItems" &&
        key !== "streamingItems"
      ) {
        collectPropStatuses(value, collected);
      }
    }
  }

  const propStatuses: PropStatus[] = [];
  for (const status of Object.values(propStatus)) {
    if (status) {
      collectPropStatuses(status, propStatuses);
    }
  }

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
 * **New in this version**: Supports nested objects and arrays.
 * - For nested objects: Access status via `propStatus.parent?.child?.isStreaming`
 * - For arrays: Access completed/streaming items via `propStatus.items?.completedItems`
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
 * // Highlight in-flight props
 * const { propStatus } = useTamboStreamStatus<Props>();
 * <h2 className={propStatus.title?.isStreaming ? "animate-pulse" : ""}>
 *   {title}
 * </h2>
 * ```
 * @example
 * ```tsx
 * // Track nested object streaming
 * interface Props {
 *   user: { name: string; email: string };
 * }
 * const { propStatus } = useTamboStreamStatus<Props>();
 * <div>
 *   {propStatus.user?.name?.isStreaming && <Spinner />}
 *   <span>{props.user.name}</span>
 * </div>
 * ```
 * @example
 * ```tsx
 * // Show only completed array items
 * interface Props {
 *   items: Array<{ id: string; text: string }>;
 * }
 * const { propStatus } = useTamboStreamStatus<Props>();
 * const completed = propStatus.items?.completedItems ?? [];
 * return (
 *   <ul>
 *     {completed.map((item) => (
 *       <li key={item.id}>{item.text}</li>
 *     ))}
 *   </ul>
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
    return deriveGlobalStreamStatus<Props>(
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
