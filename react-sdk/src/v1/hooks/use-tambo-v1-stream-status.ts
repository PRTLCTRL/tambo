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
 * Base streaming status flags for individual component props.
 * Tracks the state of each prop as it streams from the LLM.
 */
export interface BasePropStatus {
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
 * Extended streaming status for array props.
 * Includes tracking of completed and streaming items.
 */
export interface ArrayPropStatus<T = unknown> extends BasePropStatus {
  /**
   * Array items that have finished streaming.
   * Only populated when the prop is an array type.
   */
  completedItems?: T[];

  /**
   * Array items that are currently streaming (incomplete).
   * Only populated when the prop is an array type.
   */
  streamingItems?: T[];
}

/**
 * Streaming status for props, supporting nested objects and arrays.
 * For object props, includes nested status for each property.
 * For array props, includes completedItems and streamingItems.
 * For primitive props, only includes base status flags.
 */
export type PropStatus = BasePropStatus | ArrayPropStatus;

/**
 * Recursively builds nested prop status types for object props.
 * For each nested object property, creates a status object with both
 * its own streaming status and nested property statuses.
 */
export type NestedPropStatus<T> = T extends Array<infer U>
  ? ArrayPropStatus<U>
  : T extends object
    ? BasePropStatus & {
        [K in keyof T]?: NestedPropStatus<T[K]>;
      }
    : BasePropStatus;

/**
 * Track streaming status for individual props by monitoring their values.
 * Monitors when props receive their first token and when they complete streaming.
 * Supports nested objects and arrays.
 * @template Props - The type of the component props being tracked
 * @param props - The current component props object
 * @param componentStreamingState - The current streaming state of the component
 * @returns A record mapping each prop key to its nested PropStatus
 */
function usePropsStreamingStatus<Props extends object>(
  props: Props | undefined,
  componentStreamingState: TamboComponentContent["streamingState"] | undefined,
): Partial<Record<keyof Props, NestedPropStatus<Props[keyof Props]>>> {
  /** Track which property paths have received content (flattened dot notation) */
  const [startedPaths, setStartedPaths] = useState(new Set<string>());

  /** Helper to check if a value has content */
  const hasContent = (value: unknown): boolean => {
    if (value === undefined || value === null || value === "") return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return true;
  };

  /** Helper to build property paths and check for content recursively */
  const buildStartedPaths = (
    obj: Record<string, unknown>,
    prefix = "",
  ): Set<string> => {
    const paths = new Set<string>();

    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;

      if (hasContent(value)) {
        paths.add(path);

        // Recursively process nested objects
        if (value && typeof value === "object" && !Array.isArray(value)) {
          const nestedPaths = buildStartedPaths(
            value as Record<string, unknown>,
            path,
          );
          for (const nestedPath of nestedPaths) {
            paths.add(nestedPath);
          }
        }

        // For arrays, track each item
        if (Array.isArray(value)) {
          for (let i = 0; i < value.length; i++) {
            const itemPath = `${path}[${i}]`;
            paths.add(itemPath);
          }
        }
      }
    }

    return paths;
  };

  /** Update started paths when content arrives */
  useEffect(() => {
    if (!props) return;

    setStartedPaths((prev) => {
      const newPaths = buildStartedPaths(props as Record<string, unknown>);
      const combined = new Set([...prev, ...newPaths]);

      // Check if anything changed
      if (combined.size === prev.size) {
        let allMatch = true;
        for (const path of combined) {
          if (!prev.has(path)) {
            allMatch = false;
            break;
          }
        }
        if (allMatch) return prev;
      }

      return combined;
    });
  }, [props]);

  /**
   * Build nested status for a value recursively.
   * Handles objects, arrays, and primitives.
   */
  const buildNestedStatus = (
    value: unknown,
    path: string,
    isStreamingDone: boolean,
    isComponentStreaming: boolean,
  ): NestedPropStatus<unknown> => {
    const hasStarted = startedPaths.has(path);
    const isComplete = hasStarted && isStreamingDone;

    const baseStatus: BasePropStatus = {
      isPending: !hasStarted && !isComplete,
      isStreaming: hasStarted && !isComplete && isComponentStreaming,
      isSuccess: isComplete,
      error: undefined,
    };

    // Handle arrays - add completedItems and streamingItems
    if (Array.isArray(value)) {
      const completedItems: unknown[] = [];
      const streamingItems: unknown[] = [];

      for (let i = 0; i < value.length; i++) {
        const itemPath = `${path}[${i}]`;
        const itemHasStarted = startedPaths.has(itemPath);
        const itemIsComplete = itemHasStarted && isStreamingDone;

        if (itemIsComplete) {
          completedItems.push(value[i]);
        } else if (itemHasStarted && isComponentStreaming) {
          streamingItems.push(value[i]);
        }
      }

      return {
        ...baseStatus,
        completedItems,
        streamingItems,
      } as ArrayPropStatus;
    }

    // Handle nested objects - recursively build status for each property
    if (value && typeof value === "object" && !Array.isArray(value)) {
      // Create object with base status fields plus nested property statuses
      const result: BasePropStatus & Record<string, unknown> = {
        isPending: baseStatus.isPending,
        isStreaming: baseStatus.isStreaming,
        isSuccess: baseStatus.isSuccess,
        error: baseStatus.error,
      };

      for (const [key, nestedValue] of Object.entries(value)) {
        const nestedPath = `${path}.${key}`;
        result[key] = buildNestedStatus(
          nestedValue,
          nestedPath,
          isStreamingDone,
          isComponentStreaming,
        );
      }

      return result as NestedPropStatus<unknown>;
    }

    // Primitive value - just return base status
    return baseStatus;
  };

  /** Derive prop statuses from started paths and streaming state */
  return useMemo(() => {
    if (!props)
      return {} as Partial<Record<keyof Props, NestedPropStatus<Props[keyof Props]>>>;

    const isStreamingDone = componentStreamingState === "done";
    const isComponentStreaming = componentStreamingState === "streaming";

    const result = {} as Record<keyof Props, NestedPropStatus<unknown>>;

    for (const [key, value] of Object.entries(props)) {
      result[key as keyof Props] = buildNestedStatus(
        value,
        key,
        isStreamingDone,
        isComponentStreaming,
      );
    }

    return result as Partial<Record<keyof Props, NestedPropStatus<Props[keyof Props]>>>;
  }, [props, startedPaths, componentStreamingState]);
}

/**
 * Extracts all BasePropStatus objects from nested prop status structure.
 * Recursively traverses nested objects to collect all status objects.
 * @param propStatus - Nested prop status structure
 * @returns Flattened array of all base prop statuses
 */
function flattenPropStatuses(
  propStatus: Partial<Record<string, NestedPropStatus<unknown>>>,
): BasePropStatus[] {
  const statuses: BasePropStatus[] = [];

  const traverse = (status: NestedPropStatus<unknown> | undefined) => {
    if (!status) return;

    // Every nested status has base status fields
    statuses.push({
      isPending: status.isPending,
      isStreaming: status.isStreaming,
      isSuccess: status.isSuccess,
      error: status.error,
    });

    // Recursively traverse nested object properties
    for (const [key, value] of Object.entries(status)) {
      // Skip the base status fields and array-specific fields
      if (
        key === "isPending" ||
        key === "isStreaming" ||
        key === "isSuccess" ||
        key === "error" ||
        key === "completedItems" ||
        key === "streamingItems"
      ) {
        continue;
      }

      // Recursively traverse nested status
      traverse(value as NestedPropStatus<unknown>);
    }
  };

  for (const status of Object.values(propStatus)) {
    traverse(status);
  }

  return statuses;
}

/**
 * Derives global StreamStatus from component streaming state and individual prop statuses.
 * Aggregates individual prop states into a unified stream status.
 * Works with nested prop status structures by flattening them first.
 * @param componentStreamingState - The current streaming state of the component
 * @param propStatus - Nested status record for props
 * @param hasComponent - Whether a component exists in the current message
 * @param streamError - Any error from the streaming process itself
 * @returns The aggregated StreamStatus for the entire component
 */
function deriveGlobalStreamStatus(
  componentStreamingState: TamboComponentContent["streamingState"] | undefined,
  propStatus: Partial<Record<string, NestedPropStatus<unknown>>>,
  hasComponent: boolean,
  streamError?: Error,
): StreamStatus {
  const propStatuses = flattenPropStatuses(propStatus);
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
 * **Nested Objects**: Access nested property status via `propStatus.parent.child.isStreaming`
 * **Arrays**: Access completed/streaming items via `propStatus.items.completedItems`
 *
 * Pair with `useTamboComponentState` to disable inputs while streaming.
 * @see {@link https://docs.tambo.co/concepts/generative-interfaces/component-state}
 * @template Props - Component props type
 * @returns `streamStatus` (overall) and `propStatus` (per-prop nested) flags
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
 * // Show completed array items while rest streams
 * const { propStatus } = useTamboStreamStatus<{ items: Item[] }>();
 * const completed = propStatus.items?.completedItems || [];
 * return <>{completed.map(item => <ItemCard key={item.id} {...item} />)}</>;
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
