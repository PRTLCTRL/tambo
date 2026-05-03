import { EventType, type RunErrorEvent } from "@ag-ui/core";
import {
  createInitialState,
  createInitialThreadState,
  streamReducer,
} from "./event-accumulator";

function createTestStreamState(threadId: string) {
  const state = createInitialState();
  return {
    ...state,
    currentThreadId: threadId,
    threadMap: {
      [threadId]: createInitialThreadState(threadId),
    },
  };
}

describe("streamReducer RUN_ERROR handling", () => {
  it("stores error with message and code", () => {
    const state = createTestStreamState("thread_1");
    const event: RunErrorEvent = {
      type: EventType.RUN_ERROR,
      message: "Something went wrong",
      code: "INTERNAL_ERROR",
    };

    const result = streamReducer(state, {
      type: "EVENT",
      event,
      threadId: "thread_1",
    });

    expect(result.threadMap.thread_1.thread.status).toBe("idle");
    expect(result.threadMap.thread_1.streaming.status).toBe("idle");
    expect(result.threadMap.thread_1.streaming.error?.message).toBe(
      "Something went wrong",
    );
    expect(result.threadMap.thread_1.streaming.error?.code).toBe(
      "INTERNAL_ERROR",
    );
  });

  it("propagates category and isRetryable from extended error events", () => {
    const state = createTestStreamState("thread_1");
    const event = {
      type: EventType.RUN_ERROR,
      message: "You do not have access to the organization",
      code: "LLM_CLIENT_ERROR",
      category: "client_error",
      isRetryable: false,
      status: 401,
    } as RunErrorEvent;

    const result = streamReducer(state, {
      type: "EVENT",
      event,
      threadId: "thread_1",
    });

    const error = result.threadMap.thread_1.streaming.error;
    expect(error?.message).toBe("You do not have access to the organization");
    expect(error?.code).toBe("LLM_CLIENT_ERROR");
    expect(error?.category).toBe("client_error");
    expect(error?.isRetryable).toBe(false);
    expect(error?.status).toBe(401);
  });

  it("propagates server_error category with isRetryable true", () => {
    const state = createTestStreamState("thread_1");
    const event = {
      type: EventType.RUN_ERROR,
      message: "The AI provider encountered a temporary error",
      code: "LLM_SERVER_ERROR",
      category: "server_error",
      isRetryable: true,
      status: 500,
    } as RunErrorEvent;

    const result = streamReducer(state, {
      type: "EVENT",
      event,
      threadId: "thread_1",
    });

    const error = result.threadMap.thread_1.streaming.error;
    expect(error?.message).toBe(
      "The AI provider encountered a temporary error",
    );
    expect(error?.code).toBe("LLM_SERVER_ERROR");
    expect(error?.category).toBe("server_error");
    expect(error?.isRetryable).toBe(true);
    expect(error?.status).toBe(500);
  });

  it("sets lastRunCancelled and no error when code is CANCELLED", () => {
    const state = createTestStreamState("thread_1");
    const event: RunErrorEvent = {
      type: EventType.RUN_ERROR,
      message: "Run cancelled",
      code: "CANCELLED",
    };

    const result = streamReducer(state, {
      type: "EVENT",
      event,
      threadId: "thread_1",
    });

    expect(result.threadMap.thread_1.thread.lastRunCancelled).toBe(true);
    expect(result.threadMap.thread_1.streaming.error).toBeUndefined();
  });

  it("handles events without category/isRetryable (backward compat)", () => {
    const state = createTestStreamState("thread_1");
    const event: RunErrorEvent = {
      type: EventType.RUN_ERROR,
      message: "Generic error",
    };

    const result = streamReducer(state, {
      type: "EVENT",
      event,
      threadId: "thread_1",
    });

    const error = result.threadMap.thread_1.streaming.error;
    expect(error?.message).toBe("Generic error");
    expect(error?.category).toBeUndefined();
    expect(error?.isRetryable).toBeUndefined();
  });
});

describe("content index for O(1) lookup", () => {
  it("initializes with empty content index", () => {
    const state = createInitialThreadState("thread_1");
    expect(state.contentIndex).toBeInstanceOf(Map);
    expect(state.contentIndex.size).toBe(0);
  });

  it("maintains index when tool call is added via TOOL_CALL_START", () => {
    const state = createTestStreamState("thread_1");
    
    const startState = streamReducer(state, {
      type: "EVENT",
      event: {
        type: EventType.TEXT_MESSAGE_START,
        messageId: "msg_1",
        role: "assistant",
      },
      threadId: "thread_1",
    });

    const result = streamReducer(startState, {
      type: "EVENT",
      event: {
        type: EventType.TOOL_CALL_START,
        toolCallId: "tool_1",
        toolCallName: "test_tool",
        parentMessageId: "msg_1",
      },
      threadId: "thread_1",
    });

    expect(result.threadMap.thread_1.contentIndex.has("tool_1")).toBe(true);
    const location = result.threadMap.thread_1.contentIndex.get("tool_1");
    expect(location?.messageIndex).toBe(0);
    expect(location?.contentIndex).toBe(0);
  });

  it("maintains index when component is added via COMPONENT_START", () => {
    const state = createTestStreamState("thread_1");
    
    const result = streamReducer(state, {
      type: "EVENT",
      event: {
        type: EventType.CUSTOM,
        name: "tambo.component.start",
        value: {
          messageId: "msg_1",
          componentId: "comp_1",
          componentName: "TestComponent",
        },
      },
      threadId: "thread_1",
    });

    expect(result.threadMap.thread_1.contentIndex.has("comp_1")).toBe(true);
    const location = result.threadMap.thread_1.contentIndex.get("comp_1");
    expect(location?.messageIndex).toBe(0);
    expect(location?.contentIndex).toBe(0);
  });

  it("rebuilds index when loading thread messages", () => {
    const state = createTestStreamState("thread_1");
    
    const result = streamReducer(state, {
      type: "LOAD_THREAD_MESSAGES",
      threadId: "thread_1",
      messages: [
        {
          id: "msg_1",
          role: "assistant",
          content: [
            { type: "tool_use", id: "tool_1", name: "test_tool", input: {} },
            { type: "component", id: "comp_1", name: "TestComponent", props: {} },
          ],
        },
        {
          id: "msg_2",
          role: "assistant",
          content: [
            { type: "tool_use", id: "tool_2", name: "another_tool", input: {} },
          ],
        },
      ],
    });

    const index = result.threadMap.thread_1.contentIndex;
    expect(index.size).toBe(3);
    
    expect(index.get("tool_1")).toEqual({ messageIndex: 0, contentIndex: 0 });
    expect(index.get("comp_1")).toEqual({ messageIndex: 0, contentIndex: 1 });
    expect(index.get("tool_2")).toEqual({ messageIndex: 1, contentIndex: 0 });
  });

  it("uses index for O(1) lookup in TOOL_CALL_ARGS event", () => {
    const state = createTestStreamState("thread_1");
    
    const withToolCall = streamReducer(state, {
      type: "EVENT",
      event: {
        type: EventType.TEXT_MESSAGE_START,
        messageId: "msg_1",
        role: "assistant",
      },
      threadId: "thread_1",
    });

    const withTool = streamReducer(withToolCall, {
      type: "EVENT",
      event: {
        type: EventType.TOOL_CALL_START,
        toolCallId: "tool_1",
        toolCallName: "test_tool",
        parentMessageId: "msg_1",
      },
      threadId: "thread_1",
    });

    const result = streamReducer(withTool, {
      type: "EVENT",
      event: {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: "tool_1",
        delta: '{"key": "value"}',
      },
      threadId: "thread_1",
      parsedToolArgs: { key: "value" },
    });

    const message = result.threadMap.thread_1.thread.messages[0];
    const toolContent = message.content[0];
    expect(toolContent.type).toBe("tool_use");
    if (toolContent.type === "tool_use") {
      expect(toolContent.input).toEqual({ key: "value" });
    }
  });

  it("throws error if content not found in index", () => {
    const state = createTestStreamState("thread_1");
    
    expect(() => {
      streamReducer(state, {
        type: "EVENT",
        event: {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: "nonexistent_tool",
          delta: '{}',
        },
        threadId: "thread_1",
      });
    }).toThrow("tool_use nonexistent_tool not found");
  });
});
