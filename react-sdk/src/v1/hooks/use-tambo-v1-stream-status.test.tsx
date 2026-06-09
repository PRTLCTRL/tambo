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

  describe("Nested Objects", () => {
    it("should track nested object streaming status", () => {
      interface NestedProps {
        user: {
          name: string;
          email: string;
        };
      }

      const componentContent = createComponentContent({
        props: {
          user: {
            name: "John",
            email: "",
          },
        },
        streamingState: "streaming",
      });
      const message = createMessage(componentContent);
      const threadState = createThreadState([message]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      const { result } = renderHook(() => useTamboStreamStatus<NestedProps>());

      // Parent object should be streaming
      expect(result.current.propStatus.user?.isStreaming).toBe(true);
      expect(result.current.propStatus.user?.isPending).toBe(false);

      // Name should be streaming (has content)
      expect(result.current.propStatus.user?.name?.isStreaming).toBe(true);
      expect(result.current.propStatus.user?.name?.isPending).toBe(false);

      // Email should be pending (no content yet)
      expect(result.current.propStatus.user?.email?.isPending).toBe(true);
      expect(result.current.propStatus.user?.email?.isStreaming).toBe(false);
    });

    it("should mark nested objects as successful when streaming completes", () => {
      interface NestedProps {
        user: {
          name: string;
          email: string;
        };
      }

      const componentContent = createComponentContent({
        props: {
          user: {
            name: "John Doe",
            email: "john@example.com",
          },
        },
        streamingState: "done",
      });
      const message = createMessage(componentContent);
      const threadState = createThreadState([message]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      const { result } = renderHook(() => useTamboStreamStatus<NestedProps>());

      // All levels should be successful
      expect(result.current.propStatus.user?.isSuccess).toBe(true);
      expect(result.current.propStatus.user?.name?.isSuccess).toBe(true);
      expect(result.current.propStatus.user?.email?.isSuccess).toBe(true);
      expect(result.current.streamStatus.isSuccess).toBe(true);
    });

    it("should handle deeply nested objects", () => {
      interface DeeplyNestedProps {
        level1: {
          level2: {
            level3: {
              value: string;
            };
          };
        };
      }

      const componentContent = createComponentContent({
        props: {
          level1: {
            level2: {
              level3: {
                value: "deep",
              },
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

      // All nested levels should be streaming
      expect(result.current.propStatus.level1?.isStreaming).toBe(true);
      expect(result.current.propStatus.level1?.level2?.isStreaming).toBe(true);
      expect(
        result.current.propStatus.level1?.level2?.level3?.isStreaming,
      ).toBe(true);
      expect(
        result.current.propStatus.level1?.level2?.level3?.value?.isStreaming,
      ).toBe(true);
    });
  });

  describe("Array Props", () => {
    it("should track array items with completedItems and streamingItems", () => {
      interface ArrayProps {
        items: Array<{ id: string; name: string }>;
      }

      // Simulate streaming: first item complete, second item streaming, third not started
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

      // Array should be streaming
      expect(result.current.propStatus.items?.isStreaming).toBe(true);

      // Should have streamingItems (all items are still streaming since component not done)
      expect(result.current.propStatus.items?.streamingItems).toEqual([
        { id: "1", name: "Item 1" },
        { id: "2", name: "Item 2" },
      ]);

      // No completed items yet (component still streaming)
      expect(result.current.propStatus.items?.completedItems).toEqual([]);
    });

    it("should mark array items as completed when streaming finishes", () => {
      interface ArrayProps {
        items: Array<{ id: string; name: string }>;
      }

      const componentContent = createComponentContent({
        props: {
          items: [
            { id: "1", name: "Item 1" },
            { id: "2", name: "Item 2" },
            { id: "3", name: "Item 3" },
          ],
        },
        streamingState: "done",
      });
      const message = createMessage(componentContent);
      const threadState = createThreadState([message]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      const { result } = renderHook(() => useTamboStreamStatus<ArrayProps>());

      // Array should be successful
      expect(result.current.propStatus.items?.isSuccess).toBe(true);

      // All items should be in completedItems
      expect(result.current.propStatus.items?.completedItems).toEqual([
        { id: "1", name: "Item 1" },
        { id: "2", name: "Item 2" },
        { id: "3", name: "Item 3" },
      ]);

      // No streaming items
      expect(result.current.propStatus.items?.streamingItems).toEqual([]);
    });

    it("should handle empty arrays", () => {
      interface ArrayProps {
        items: Array<string>;
      }

      const componentContent = createComponentContent({
        props: {
          items: [],
        },
        streamingState: "streaming",
      });
      const message = createMessage(componentContent);
      const threadState = createThreadState([message]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      const { result } = renderHook(() => useTamboStreamStatus<ArrayProps>());

      // Empty array should be pending (no content)
      expect(result.current.propStatus.items?.isPending).toBe(true);
      expect(result.current.propStatus.items?.completedItems).toEqual([]);
      expect(result.current.propStatus.items?.streamingItems).toEqual([]);
    });

    it("should handle arrays of primitive values", () => {
      interface ArrayProps {
        tags: string[];
      }

      const componentContent = createComponentContent({
        props: {
          tags: ["react", "typescript", "testing"],
        },
        streamingState: "done",
      });
      const message = createMessage(componentContent);
      const threadState = createThreadState([message]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      const { result } = renderHook(() => useTamboStreamStatus<ArrayProps>());

      expect(result.current.propStatus.tags?.isSuccess).toBe(true);
      expect(result.current.propStatus.tags?.completedItems).toEqual([
        "react",
        "typescript",
        "testing",
      ]);
    });
  });

  describe("Complex Nested Structures", () => {
    it("should handle objects with nested arrays", () => {
      interface ComplexProps {
        user: {
          name: string;
          posts: Array<{ id: string; title: string }>;
        };
      }

      const componentContent = createComponentContent({
        props: {
          user: {
            name: "John",
            posts: [
              { id: "1", title: "Post 1" },
              { id: "2", title: "Post 2" },
            ],
          },
        },
        streamingState: "done",
      });
      const message = createMessage(componentContent);
      const threadState = createThreadState([message]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      const { result } = renderHook(() => useTamboStreamStatus<ComplexProps>());

      // User object should be successful
      expect(result.current.propStatus.user?.isSuccess).toBe(true);
      expect(result.current.propStatus.user?.name?.isSuccess).toBe(true);

      // Posts array should be successful with all completed items
      expect(result.current.propStatus.user?.posts?.isSuccess).toBe(true);
      expect(result.current.propStatus.user?.posts?.completedItems).toEqual([
        { id: "1", title: "Post 1" },
        { id: "2", title: "Post 2" },
      ]);
    });

    it("should handle arrays containing nested objects", () => {
      interface ComplexProps {
        items: Array<{
          id: string;
          metadata: {
            author: string;
            tags: string[];
          };
        }>;
      }

      const componentContent = createComponentContent({
        props: {
          items: [
            {
              id: "1",
              metadata: {
                author: "John",
                tags: ["react", "typescript"],
              },
            },
          ],
        },
        streamingState: "done",
      });
      const message = createMessage(componentContent);
      const threadState = createThreadState([message]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      const { result } = renderHook(() => useTamboStreamStatus<ComplexProps>());

      expect(result.current.propStatus.items?.isSuccess).toBe(true);
      expect(result.current.propStatus.items?.completedItems).toHaveLength(1);
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

    it("should handle null and undefined in nested structures", () => {
      interface PropsWithNulls {
        data: {
          value: string | null;
          nested: {
            inner: string;
          } | null;
        };
      }

      const componentContent = createComponentContent({
        props: {
          data: {
            value: null,
            nested: null,
          },
        },
        streamingState: "streaming",
      });
      const message = createMessage(componentContent);
      const threadState = createThreadState([message]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      const { result } = renderHook(() =>
        useTamboStreamStatus<PropsWithNulls>(),
      );

      // Data object has content (even though nested values are null)
      expect(result.current.propStatus.data?.isStreaming).toBe(true);

      // Null values should be pending
      expect(result.current.propStatus.data?.value?.isPending).toBe(true);
      expect(result.current.propStatus.data?.nested?.isPending).toBe(true);
    });
  });
});
