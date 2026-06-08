import { renderHook } from "@testing-library/react";
import { useTamboStreamStatus } from "./use-tambo-v1-stream-status";

// Mock the required hooks
jest.mock("../utils/component-renderer", () => ({
  useComponentContent: jest.fn(),
}));

jest.mock("../providers/tambo-v1-stream-context", () => ({
  useStreamState: jest.fn(),
}));

// Import the mocked functions
import { useComponentContent } from "../utils/component-renderer";
import { useStreamState } from "../providers/tambo-v1-stream-context";
import type { StreamState, ThreadState } from "@tambo-ai/client";
import type {
  TamboComponentContent,
  TamboThreadMessage,
} from "../types/message";

// Mock window for SSR tests
const originalWindow = global.window;

// Get the mocked functions
const mockUseTamboComponentContent = jest.mocked(useComponentContent);
const mockUseStreamState = jest.mocked(useStreamState);

/**
 * Helper to create a component content block.
 * @returns A TamboComponentContent with test defaults.
 */
function createComponentContent(
  overrides: Partial<TamboComponentContent> = {},
): TamboComponentContent {
  return {
    type: "component",
    id: "test-component",
    name: "TestComponent",
    props: {},
    streamingState: "started",
    ...overrides,
  };
}

/**
 * Helper to create a message with a component.
 * @returns A TamboThreadMessage with a component content block.
 */
function createMessage(
  componentContent: TamboComponentContent,
  overrides: Partial<TamboThreadMessage> = {},
): TamboThreadMessage {
  return {
    id: "test-message",
    role: "assistant",
    content: [componentContent],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Helper to create a thread state.
 * @returns A ThreadState with test defaults.
 */
function createThreadState(
  messages: TamboThreadMessage[],
  overrides: Partial<ThreadState> = {},
): ThreadState {
  return {
    thread: {
      id: "test-thread",
      messages,
      status: "idle",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastRunCancelled: false,
    },
    streaming: {
      status: "idle",
    },
    accumulatingToolArgs: {},
    ...overrides,
  };
}

/**
 * Helper to create a stream state.
 * @returns A StreamState with test defaults.
 */
function createStreamState(
  threadState: ThreadState,
  threadId = "test-thread",
): StreamState {
  return {
    threadMap: {
      [threadId]: threadState,
    },
    currentThreadId: threadId,
  };
}

describe("useTamboStreamStatus", () => {
  beforeEach(() => {
    // Restore window for client-side tests
    global.window = originalWindow;

    // Default mock implementations
    mockUseTamboComponentContent.mockReturnValue({
      componentId: "test-component",
      threadId: "test-thread",
      messageId: "test-message",
      componentName: "TestComponent",
    });

    const componentContent = createComponentContent({ props: {} });
    const message = createMessage(componentContent);
    const threadState = createThreadState([message]);
    mockUseStreamState.mockReturnValue(createStreamState(threadState));
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Restore window after each test
    global.window = originalWindow;
  });

  describe("Initial State", () => {
    it("should start with all flags as pending when component streaming is 'started' and no props", () => {
      const componentContent = createComponentContent({
        props: { title: "", body: "" },
        streamingState: "started",
      });
      const message = createMessage(componentContent);
      const threadState = createThreadState([message]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      const { result } = renderHook(() =>
        useTamboStreamStatus<{ title: string; body: string }>(),
      );

      expect(result.current.streamStatus).toEqual({
        isPending: true,
        isStreaming: false,
        isSuccess: false,
        isError: false,
        streamError: undefined,
      });

      expect(result.current.propStatus.title).toEqual({
        isPending: true,
        isStreaming: false,
        isSuccess: false,
        error: undefined,
      });

      expect(result.current.propStatus.body).toEqual({
        isPending: true,
        isStreaming: false,
        isSuccess: false,
        error: undefined,
      });
    });
  });

  describe("Streaming State Transitions", () => {
    it("should show isStreaming when component is streaming even before props receive content", () => {
      // Component is streaming but props are still empty
      const componentContent = createComponentContent({
        props: { title: "", body: "" },
        streamingState: "streaming",
      });
      const message = createMessage(componentContent);
      const threadState = createThreadState([message]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      const { result } = renderHook(() =>
        useTamboStreamStatus<{ title: string; body: string }>(),
      );

      // Global should be streaming even though no props have content yet
      expect(result.current.streamStatus.isStreaming).toBe(true);
      expect(result.current.streamStatus.isPending).toBe(false);

      // Individual props should still be pending
      expect(result.current.propStatus.title?.isPending).toBe(true);
      expect(result.current.propStatus.title?.isStreaming).toBe(false);
    });

    it("should show prop streaming when props receive content during streaming", () => {
      const componentContent = createComponentContent({
        props: { title: "Hello", body: "" },
        streamingState: "streaming",
      });
      const message = createMessage(componentContent);
      const threadState = createThreadState([message]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      const { result } = renderHook(() =>
        useTamboStreamStatus<{ title: string; body: string }>(),
      );

      // Title prop should be streaming since it has content
      expect(result.current.propStatus.title?.isStreaming).toBe(true);
      expect(result.current.propStatus.title?.isPending).toBe(false);

      // Body prop should still be pending since it has no content
      expect(result.current.propStatus.body?.isStreaming).toBe(false);
      expect(result.current.propStatus.body?.isPending).toBe(true);

      // Global should be streaming because at least one prop is streaming
      expect(result.current.streamStatus.isStreaming).toBe(true);
    });

    it("should transition through Init -> Streaming -> Success lifecycle", () => {
      // Start with "started" (Init phase)
      const componentContent = createComponentContent({
        props: { title: "", body: "" },
        streamingState: "started",
      });
      const message = createMessage(componentContent);
      let threadState = createThreadState([message]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      const { result, rerender } = renderHook(() =>
        useTamboStreamStatus<{ title: string; body: string }>(),
      );

      // Phase 1: Init - isPending = true
      expect(result.current.streamStatus.isPending).toBe(true);
      expect(result.current.streamStatus.isStreaming).toBe(false);
      expect(result.current.streamStatus.isSuccess).toBe(false);

      // Phase 2: Streaming - move to "streaming" with content
      const streamingComponent = createComponentContent({
        props: { title: "Hello World", body: "Some content" },
        streamingState: "streaming",
      });
      const streamingMessage = createMessage(streamingComponent);
      threadState = createThreadState([streamingMessage]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      rerender();

      expect(result.current.streamStatus.isPending).toBe(false);
      expect(result.current.streamStatus.isStreaming).toBe(true);
      expect(result.current.streamStatus.isSuccess).toBe(false);

      // Phase 3: Complete - move to "done"
      const doneComponent = createComponentContent({
        props: { title: "Hello World", body: "Some content" },
        streamingState: "done",
      });
      const doneMessage = createMessage(doneComponent);
      threadState = createThreadState([doneMessage]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      rerender();

      expect(result.current.streamStatus.isPending).toBe(false);
      expect(result.current.streamStatus.isStreaming).toBe(false);
      expect(result.current.streamStatus.isSuccess).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should handle error state correctly", () => {
      const componentContent = createComponentContent({
        props: { title: "", body: "" },
        streamingState: "started",
      });
      const message = createMessage(componentContent);
      const threadState = createThreadState([message], {
        streaming: {
          status: "idle",
          error: { message: "Generation failed", code: "GENERATION_ERROR" },
        },
      });
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      const { result } = renderHook(() =>
        useTamboStreamStatus<{ title: string; body: string }>(),
      );

      // Error state: isPending=false (error overrides pending), isStreaming=false (error stops streaming)
      expect(result.current.streamStatus.isPending).toBe(false);
      expect(result.current.streamStatus.isStreaming).toBe(false);
      expect(result.current.streamStatus.isSuccess).toBe(false);
      expect(result.current.streamStatus.isError).toBe(true);
      expect(result.current.streamStatus.streamError?.message).toBe(
        "Generation failed",
      );
    });
  });

  describe("Derivation Rules", () => {
    it("should derive isPending correctly (no streaming activity AND all props pending)", () => {
      const componentContent = createComponentContent({
        props: { title: "", body: "", footer: "" },
        streamingState: "started",
      });
      const message = createMessage(componentContent);
      const threadState = createThreadState([message]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      const { result } = renderHook(() =>
        useTamboStreamStatus<{
          title: string;
          body: string;
          footer: string;
        }>(),
      );

      // All props are pending and no streaming activity
      expect(result.current.streamStatus.isPending).toBe(true);
      expect(result.current.propStatus.title?.isPending).toBe(true);
      expect(result.current.propStatus.body?.isPending).toBe(true);
      expect(result.current.propStatus.footer?.isPending).toBe(true);
    });

    it("should derive isSuccess correctly (streaming done AND all props successful)", () => {
      // Step 1: Start with streaming, props empty
      const startComponent = createComponentContent({
        props: { title: "", body: "" },
        streamingState: "streaming",
      });
      const startMessage = createMessage(startComponent);
      let threadState = createThreadState([startMessage]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      const { result, rerender } = renderHook(() =>
        useTamboStreamStatus<{ title: string; body: string }>(),
      );

      // Step 2: Simulate streaming in title
      const titleComponent = createComponentContent({
        props: { title: "Complete Title", body: "" },
        streamingState: "streaming",
      });
      const titleMessage = createMessage(titleComponent);
      threadState = createThreadState([titleMessage]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));
      rerender();

      // Step 3: Simulate streaming in body
      const bodyComponent = createComponentContent({
        props: { title: "Complete Title", body: "Complete Body" },
        streamingState: "streaming",
      });
      const bodyMessage = createMessage(bodyComponent);
      threadState = createThreadState([bodyMessage]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));
      rerender();

      // Step 4: Component streaming done
      const doneComponent = createComponentContent({
        props: { title: "Complete Title", body: "Complete Body" },
        streamingState: "done",
      });
      const doneMessage = createMessage(doneComponent);
      threadState = createThreadState([doneMessage]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));
      rerender();

      // Now both props should be successful
      expect(result.current.propStatus.title?.isSuccess).toBe(true);
      expect(result.current.propStatus.body?.isSuccess).toBe(true);
      expect(result.current.streamStatus.isSuccess).toBe(true);
    });
  });

  describe("Type Safety", () => {
    it("should provide strongly typed prop status based on generic", () => {
      interface TestProps {
        title: string;
        description: string;
        count: number;
      }

      const componentContent = createComponentContent({
        props: { title: "Test", description: "Test desc", count: 42 },
        streamingState: "done",
      });
      const message = createMessage(componentContent);
      const threadState = createThreadState([message]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      const { result } = renderHook(() => useTamboStreamStatus<TestProps>());

      // TypeScript should infer these keys correctly
      expect(result.current.propStatus.title).toBeDefined();
      expect(result.current.propStatus.description).toBeDefined();
      expect(result.current.propStatus.count).toBeDefined();
    });

    it("should work without generic type parameter", () => {
      const componentContent = createComponentContent({
        props: { dynamicProp: "value" },
        streamingState: "done",
      });
      const message = createMessage(componentContent);
      const threadState = createThreadState([message]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      const { result } = renderHook(() => useTamboStreamStatus());

      expect(result.current.streamStatus).toBeDefined();
      expect(result.current.propStatus).toBeDefined();
    });
  });

  describe("Edge Cases", () => {
    it("should handle missing component gracefully", () => {
      const threadState = createThreadState([
        {
          id: "test-message",
          role: "assistant",
          content: [{ type: "text", text: "Hello" }],
          createdAt: new Date().toISOString(),
        },
      ]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      const { result } = renderHook(() => useTamboStreamStatus());

      expect(result.current.streamStatus.isPending).toBe(true);
      expect(result.current.propStatus).toEqual({});
    });

    it("should handle missing thread gracefully", () => {
      mockUseStreamState.mockReturnValue({
        threadMap: {},
        currentThreadId: "non-existent",
      });

      const { result } = renderHook(() => useTamboStreamStatus());

      expect(result.current.streamStatus.isPending).toBe(true);
      expect(result.current.propStatus).toEqual({});
    });

    it("should error when component ID changes unexpectedly", () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      const componentContent = createComponentContent({
        id: "first-component",
        props: { title: "Title" },
        streamingState: "streaming",
      });
      const message = createMessage(componentContent);
      const threadState = createThreadState([message]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      mockUseTamboComponentContent.mockReturnValue({
        componentId: "first-component",
        threadId: "test-thread",
        messageId: "test-message",
        componentName: "TestComponent",
      });

      const { rerender } = renderHook(() =>
        useTamboStreamStatus<{ title: string }>(),
      );

      // No error initially
      expect(consoleSpy).not.toHaveBeenCalled();

      // Change componentId (this should not happen in practice)
      mockUseTamboComponentContent.mockReturnValue({
        componentId: "second-component",
        threadId: "test-thread",
        messageId: "test-message",
        componentName: "TestComponent",
      });

      rerender();

      // Should log an error indicating incorrect provider usage
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("componentId changed"),
      );

      consoleSpy.mockRestore();
    });
  });

  describe("Nested Object Support", () => {
    it("should track nested object prop streaming status", () => {
      interface NestedProps {
        user: {
          name: string;
          email: string;
        };
      }

      const componentContent = createComponentContent({
        props: { user: { name: "Alice", email: "" } },
        streamingState: "streaming",
      });
      const message = createMessage(componentContent);
      const threadState = createThreadState([message]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      const { result } = renderHook(() => useTamboStreamStatus<NestedProps>());

      // User object itself has started
      expect(result.current.propStatus.user?.isStreaming).toBe(true);
      expect(result.current.propStatus.user?.isPending).toBe(false);

      // Access nested status via type assertion
      const userStatus = result.current.propStatus.user as PropStatus & {
        name: PropStatus;
        email: PropStatus;
      };

      // Name has content and is streaming
      expect(userStatus.name.isStreaming).toBe(true);
      expect(userStatus.name.isPending).toBe(false);

      // Email has no content yet, so it's pending
      expect(userStatus.email.isPending).toBe(true);
      expect(userStatus.email.isStreaming).toBe(false);
    });

    it("should mark nested props as success when streaming completes", () => {
      interface NestedProps {
        user: {
          name: string;
          email: string;
        };
      }

      const componentContent = createComponentContent({
        props: { user: { name: "Alice", email: "alice@example.com" } },
        streamingState: "done",
      });
      const message = createMessage(componentContent);
      const threadState = createThreadState([message]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      const { result } = renderHook(() => useTamboStreamStatus<NestedProps>());

      expect(result.current.propStatus.user?.isSuccess).toBe(true);

      const userStatus = result.current.propStatus.user as PropStatus & {
        name: PropStatus;
        email: PropStatus;
      };

      expect(userStatus.name.isSuccess).toBe(true);
      expect(userStatus.email.isSuccess).toBe(true);
    });

    it("should handle deeply nested objects", () => {
      interface DeeplyNestedProps {
        config: {
          database: {
            host: string;
            port: number;
          };
        };
      }

      const componentContent = createComponentContent({
        props: {
          config: {
            database: {
              host: "localhost",
              port: 5432,
            },
          },
        },
        streamingState: "streaming",
      });
      const message = createMessage(componentContent);
      const threadState = createThreadState([message]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      const { result } = renderHook(() =>
        useTamboStreamStatus<DeeplyNestedProps>(),
      );

      const configStatus = result.current.propStatus.config as PropStatus & {
        database: PropStatus & {
          host: PropStatus;
          port: PropStatus;
        };
      };

      expect(configStatus.database.host.isStreaming).toBe(true);
      expect(configStatus.database.port.isStreaming).toBe(true);
    });
  });

  describe("Array Support", () => {
    it("should provide completedItems and streamingItems for array props", () => {
      interface ArrayProps {
        items: Array<{ id: string; name: string }>;
      }

      const componentContent = createComponentContent({
        props: {
          items: [
            { id: "1", name: "Item 1" },
            { id: "2", name: "Item 2" },
          ],
        },
        streamingState: "streaming",
      });
      const message = createMessage(componentContent);
      const threadState = createThreadState([message]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      const { result } = renderHook(() => useTamboStreamStatus<ArrayProps>());

      const itemsStatus = result.current.propStatus.items;
      expect(itemsStatus?.isStreaming).toBe(true);

      // During streaming, items are in streamingItems
      expect(itemsStatus?.streamingItems).toHaveLength(2);
      expect(itemsStatus?.completedItems).toHaveLength(0);
    });

    it("should move items to completedItems when streaming finishes", () => {
      interface ArrayProps {
        items: Array<{ id: string; name: string }>;
      }

      const componentContent = createComponentContent({
        props: {
          items: [
            { id: "1", name: "Item 1" },
            { id: "2", name: "Item 2" },
          ],
        },
        streamingState: "done",
      });
      const message = createMessage(componentContent);
      const threadState = createThreadState([message]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      const { result } = renderHook(() => useTamboStreamStatus<ArrayProps>());

      const itemsStatus = result.current.propStatus.items;
      expect(itemsStatus?.isSuccess).toBe(true);

      // After completion, items are in completedItems
      expect(itemsStatus?.completedItems).toHaveLength(2);
      expect(itemsStatus?.streamingItems).toHaveLength(0);
    });

    it("should handle array of primitives", () => {
      interface PrimitiveArrayProps {
        tags: string[];
      }

      const componentContent = createComponentContent({
        props: {
          tags: ["react", "typescript", "streaming"],
        },
        streamingState: "done",
      });
      const message = createMessage(componentContent);
      const threadState = createThreadState([message]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      const { result } = renderHook(() =>
        useTamboStreamStatus<PrimitiveArrayProps>(),
      );

      const tagsStatus = result.current.propStatus.tags;
      expect(tagsStatus?.isSuccess).toBe(true);
      expect(tagsStatus?.completedItems).toEqual([
        "react",
        "typescript",
        "streaming",
      ]);
    });

    it("should handle empty arrays", () => {
      interface EmptyArrayProps {
        items: string[];
      }

      const componentContent = createComponentContent({
        props: { items: [] },
        streamingState: "started",
      });
      const message = createMessage(componentContent);
      const threadState = createThreadState([message]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      const { result } = renderHook(() =>
        useTamboStreamStatus<EmptyArrayProps>(),
      );

      const itemsStatus = result.current.propStatus.items;
      // Empty array has no content, so it should be pending
      expect(itemsStatus?.isPending).toBe(true);
      expect(itemsStatus?.completedItems).toHaveLength(0);
      expect(itemsStatus?.streamingItems).toHaveLength(0);
    });
  });

  describe("Mixed Nested and Array Support", () => {
    it("should handle arrays containing nested objects", () => {
      interface ComplexProps {
        users: Array<{
          id: string;
          profile: {
            name: string;
            email: string;
          };
        }>;
      }

      const componentContent = createComponentContent({
        props: {
          users: [
            {
              id: "1",
              profile: { name: "Alice", email: "alice@example.com" },
            },
          ],
        },
        streamingState: "done",
      });
      const message = createMessage(componentContent);
      const threadState = createThreadState([message]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      const { result } = renderHook(() => useTamboStreamStatus<ComplexProps>());

      const usersStatus = result.current.propStatus.users;
      expect(usersStatus?.isSuccess).toBe(true);
      expect(usersStatus?.completedItems).toHaveLength(1);

      // Verify the nested object structure is preserved
      const completedItem = usersStatus?.completedItems?.[0] as {
        id: string;
        profile: { name: string; email: string };
      };
      expect(completedItem.profile.name).toBe("Alice");
    });

    it("should handle objects containing arrays", () => {
      interface NestedArrayProps {
        data: {
          tags: string[];
          scores: number[];
        };
      }

      const componentContent = createComponentContent({
        props: {
          data: {
            tags: ["tag1", "tag2"],
            scores: [10, 20, 30],
          },
        },
        streamingState: "streaming",
      });
      const message = createMessage(componentContent);
      const threadState = createThreadState([message]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      const { result } = renderHook(() =>
        useTamboStreamStatus<NestedArrayProps>(),
      );

      const dataStatus = result.current.propStatus.data as PropStatus & {
        tags: PropStatus;
        scores: PropStatus;
      };

      expect(dataStatus.tags.isStreaming).toBe(true);
      expect(dataStatus.tags.streamingItems).toHaveLength(2);

      expect(dataStatus.scores.isStreaming).toBe(true);
      expect(dataStatus.scores.streamingItems).toHaveLength(3);
    });
  });
});
