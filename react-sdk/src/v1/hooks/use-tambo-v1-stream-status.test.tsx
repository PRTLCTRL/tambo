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
    it("should track streaming status for nested object properties", () => {
      interface UserProps {
        user: {
          name: string;
          email: string;
        };
      }

      // Start with empty nested object
      const componentContent = createComponentContent({
        props: { user: { name: "", email: "" } },
        streamingState: "streaming",
      });
      const message = createMessage(componentContent);
      let threadState = createThreadState([message]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      const { result, rerender } = renderHook(() =>
        useTamboStreamStatus<UserProps>(),
      );

      // Initially, user object hasn't started
      expect(result.current.propStatus.user?.isPending).toBe(true);

      // Add content to name field
      const nameStreamingContent = createComponentContent({
        props: { user: { name: "John", email: "" } },
        streamingState: "streaming",
      });
      const nameStreamingMessage = createMessage(nameStreamingContent);
      threadState = createThreadState([nameStreamingMessage]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));
      rerender();

      // User object should be streaming, name should be streaming
      const userStatus = result.current.propStatus.user as Record<
        string,
        unknown
      >;
      expect(userStatus?.isStreaming).toBe(true);
      expect((userStatus?.name as { isStreaming: boolean })?.isStreaming).toBe(
        true,
      );
      expect((userStatus?.email as { isPending: boolean })?.isPending).toBe(
        true,
      );

      // Add content to email field
      const emailStreamingContent = createComponentContent({
        props: { user: { name: "John", email: "john@example.com" } },
        streamingState: "streaming",
      });
      const emailStreamingMessage = createMessage(emailStreamingContent);
      threadState = createThreadState([emailStreamingMessage]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));
      rerender();

      // Both fields should be streaming
      const userStreamingStatus = result.current.propStatus.user as Record<
        string,
        unknown
      >;
      expect(
        (userStreamingStatus?.name as { isStreaming: boolean })?.isStreaming,
      ).toBe(true);
      expect(
        (userStreamingStatus?.email as { isStreaming: boolean })?.isStreaming,
      ).toBe(true);

      // Complete streaming
      const doneContent = createComponentContent({
        props: { user: { name: "John", email: "john@example.com" } },
        streamingState: "done",
      });
      const doneMessage = createMessage(doneContent);
      threadState = createThreadState([doneMessage]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));
      rerender();

      // All fields should be successful
      const userDoneStatus = result.current.propStatus.user as Record<
        string,
        unknown
      >;
      expect(userDoneStatus?.isSuccess).toBe(true);
      expect(
        (userDoneStatus?.name as { isSuccess: boolean })?.isSuccess,
      ).toBe(true);
      expect(
        (userDoneStatus?.email as { isSuccess: boolean })?.isSuccess,
      ).toBe(true);
    });

    it("should track deeply nested object properties", () => {
      interface DeepProps {
        level1: {
          level2: {
            level3: string;
          };
        };
      }

      const componentContent = createComponentContent({
        props: { level1: { level2: { level3: "deep value" } } },
        streamingState: "streaming",
      });
      const message = createMessage(componentContent);
      const threadState = createThreadState([message]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      const { result } = renderHook(() => useTamboStreamStatus<DeepProps>());

      const level1 = result.current.propStatus.level1 as Record<
        string,
        unknown
      >;
      const level2 = level1?.level2 as Record<string, unknown>;
      const level3 = level2?.level3 as { isStreaming: boolean };

      expect(level3?.isStreaming).toBe(true);
    });
  });

  describe("Array Props", () => {
    it("should provide completedItems and streamingItems for arrays", () => {
      interface ArrayProps {
        items: string[];
      }

      // Start with empty array
      const startContent = createComponentContent({
        props: { items: [] },
        streamingState: "streaming",
      });
      const startMessage = createMessage(startContent);
      let threadState = createThreadState([startMessage]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      const { result, rerender } = renderHook(() =>
        useTamboStreamStatus<ArrayProps>(),
      );

      // Array hasn't started yet
      expect(result.current.propStatus.items?.isPending).toBe(true);

      // Add first item
      const firstItemContent = createComponentContent({
        props: { items: ["item1"] },
        streamingState: "streaming",
      });
      const firstItemMessage = createMessage(firstItemContent);
      threadState = createThreadState([firstItemMessage]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));
      rerender();

      // First item should be in streamingItems
      expect(result.current.propStatus.items?.isStreaming).toBe(true);
      expect(result.current.propStatus.items?.completedItems).toEqual([]);
      expect(result.current.propStatus.items?.streamingItems).toEqual([
        "item1",
      ]);

      // Add second item
      const secondItemContent = createComponentContent({
        props: { items: ["item1", "item2"] },
        streamingState: "streaming",
      });
      const secondItemMessage = createMessage(secondItemContent);
      threadState = createThreadState([secondItemMessage]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));
      rerender();

      // First item completed, second item streaming
      expect(result.current.propStatus.items?.completedItems).toEqual([
        "item1",
      ]);
      expect(result.current.propStatus.items?.streamingItems).toEqual([
        "item2",
      ]);

      // Complete streaming
      const doneContent = createComponentContent({
        props: { items: ["item1", "item2", "item3"] },
        streamingState: "done",
      });
      const doneMessage = createMessage(doneContent);
      threadState = createThreadState([doneMessage]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));
      rerender();

      // All items should be completed
      expect(result.current.propStatus.items?.isSuccess).toBe(true);
      expect(result.current.propStatus.items?.completedItems).toEqual([
        "item1",
        "item2",
        "item3",
      ]);
      expect(result.current.propStatus.items?.streamingItems).toEqual([]);
    });

    it("should handle arrays of objects", () => {
      interface ObjectArrayProps {
        users: { name: string; age: number }[];
      }

      const componentContent = createComponentContent({
        props: {
          users: [
            { name: "Alice", age: 30 },
            { name: "Bob", age: 25 },
          ],
        },
        streamingState: "streaming",
      });
      const message = createMessage(componentContent);
      const threadState = createThreadState([message]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      const { result } = renderHook(() =>
        useTamboStreamStatus<ObjectArrayProps>(),
      );

      expect(result.current.propStatus.users?.isStreaming).toBe(true);
      expect(result.current.propStatus.users?.completedItems).toEqual([
        { name: "Alice", age: 30 },
      ]);
      expect(result.current.propStatus.users?.streamingItems).toEqual([
        { name: "Bob", age: 25 },
      ]);
    });
  });

  describe("Mixed Nested Structures", () => {
    it("should handle nested objects with arrays", () => {
      interface MixedProps {
        data: {
          title: string;
          items: string[];
        };
      }

      const componentContent = createComponentContent({
        props: {
          data: {
            title: "My List",
            items: ["a", "b", "c"],
          },
        },
        streamingState: "streaming",
      });
      const message = createMessage(componentContent);
      const threadState = createThreadState([message]);
      mockUseStreamState.mockReturnValue(createStreamState(threadState));

      const { result } = renderHook(() => useTamboStreamStatus<MixedProps>());

      const dataStatus = result.current.propStatus.data as Record<
        string,
        unknown
      >;
      expect(dataStatus?.isStreaming).toBe(true);
      expect((dataStatus?.title as { isStreaming: boolean })?.isStreaming).toBe(
        true,
      );

      const itemsStatus = dataStatus?.items as {
        completedItems: string[];
        streamingItems: string[];
      };
      expect(itemsStatus?.completedItems).toEqual(["a", "b"]);
      expect(itemsStatus?.streamingItems).toEqual(["c"]);
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
});
