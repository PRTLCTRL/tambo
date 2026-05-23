/**
 * Tests for automatic interactables feature
 */
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { TamboInteractableProvider, useTamboInteractable } from "./tambo-interactable-provider";
import { TamboRegistryProvider } from "./tambo-registry-provider";
import { TamboContextHelpersProvider } from "./tambo-context-helpers-provider";
import { TamboConfigContext } from "../v1/providers/tambo-v1-provider";
import { StreamStateContext, StreamDispatchContext } from "../v1/providers/tambo-v1-stream-context";
import { createInitialState, type StreamState } from "@tambo-ai/client";
import { z } from "zod/v3";

describe("AutoInteractables", () => {
  const mockComponent = {
    name: "TestCard",
    description: "A test card component",
    component: () => <div>Test</div>,
    propsSchema: z.object({
      title: z.string(),
      content: z.string(),
    }),
  };

  const mockDispatch = jest.fn();

  function createTestWrapper({
    autoInteractables,
    streamState,
  }: {
    autoInteractables: boolean;
    streamState: StreamState;
  }) {
    return function Wrapper({ children }: { children: React.ReactNode }) {
      return (
        <TamboRegistryProvider components={[mockComponent]}>
          <TamboContextHelpersProvider>
            <TamboConfigContext.Provider value={{ autoInteractables }}>
              <StreamStateContext.Provider value={streamState}>
                <StreamDispatchContext.Provider value={mockDispatch}>
                  <TamboInteractableProvider>
                    {children}
                  </TamboInteractableProvider>
                </StreamDispatchContext.Provider>
              </StreamStateContext.Provider>
            </TamboConfigContext.Provider>
          </TamboContextHelpersProvider>
        </TamboRegistryProvider>
      );
    };
  }

  it("should automatically add completed components when autoInteractables is enabled", async () => {
    const streamState: StreamState = {
      ...createInitialState(),
      threadMap: {
        "thread_123": {
          thread: {
            id: "thread_123",
            messages: [
              {
                id: "msg_1",
                role: "assistant",
                content: [
                  {
                    type: "component",
                    componentId: "comp_1",
                    componentName: "TestCard",
                    props: {
                      title: "Hello",
                      content: "World",
                    },
                    streamingState: "done",
                  },
                ],
              },
            ],
          },
          ...createInitialState().threadMap["__PLACEHOLDER__"],
        },
      },
      currentThreadId: "thread_123",
    };

    const { result } = renderHook(() => useTamboInteractable(), {
      wrapper: createTestWrapper({ autoInteractables: true, streamState }),
    });

    await waitFor(() => {
      expect(result.current.interactableComponents.length).toBe(1);
    });

    expect(result.current.interactableComponents[0].name).toBe("TestCard");
    expect(result.current.interactableComponents[0].props).toEqual({
      title: "Hello",
      content: "World",
    });
  });

  it("should NOT add components when autoInteractables is disabled", async () => {
    const streamState: StreamState = {
      ...createInitialState(),
      threadMap: {
        "thread_123": {
          thread: {
            id: "thread_123",
            messages: [
              {
                id: "msg_1",
                role: "assistant",
                content: [
                  {
                    type: "component",
                    componentId: "comp_1",
                    componentName: "TestCard",
                    props: {
                      title: "Hello",
                      content: "World",
                    },
                    streamingState: "done",
                  },
                ],
              },
            ],
          },
          ...createInitialState().threadMap["__PLACEHOLDER__"],
        },
      },
      currentThreadId: "thread_123",
    };

    const { result } = renderHook(() => useTamboInteractable(), {
      wrapper: createTestWrapper({ autoInteractables: false, streamState }),
    });

    // Wait a bit to ensure no components are added
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(result.current.interactableComponents.length).toBe(0);
  });

  it("should NOT add components that are still streaming", async () => {
    const streamState: StreamState = {
      ...createInitialState(),
      threadMap: {
        "thread_123": {
          thread: {
            id: "thread_123",
            messages: [
              {
                id: "msg_1",
                role: "assistant",
                content: [
                  {
                    type: "component",
                    componentId: "comp_1",
                    componentName: "TestCard",
                    props: {
                      title: "Hello",
                      content: "World",
                    },
                    streamingState: "streaming",
                  },
                ],
              },
            ],
          },
          ...createInitialState().threadMap["__PLACEHOLDER__"],
        },
      },
      currentThreadId: "thread_123",
    };

    const { result } = renderHook(() => useTamboInteractable(), {
      wrapper: createTestWrapper({ autoInteractables: true, streamState }),
    });

    // Wait a bit to ensure no components are added while streaming
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(result.current.interactableComponents.length).toBe(0);
  });

  it("should not add the same component twice", async () => {
    const streamState: StreamState = {
      ...createInitialState(),
      threadMap: {
        "thread_123": {
          thread: {
            id: "thread_123",
            messages: [
              {
                id: "msg_1",
                role: "assistant",
                content: [
                  {
                    type: "component",
                    componentId: "comp_1",
                    componentName: "TestCard",
                    props: {
                      title: "Hello",
                      content: "World",
                    },
                    streamingState: "done",
                  },
                ],
              },
            ],
          },
          ...createInitialState().threadMap["__PLACEHOLDER__"],
        },
      },
      currentThreadId: "thread_123",
    };

    const { result, rerender } = renderHook(() => useTamboInteractable(), {
      wrapper: createTestWrapper({ autoInteractables: true, streamState }),
    });

    await waitFor(() => {
      expect(result.current.interactableComponents.length).toBe(1);
    });

    // Rerender to trigger useEffect again
    rerender();

    // Should still only have one component
    expect(result.current.interactableComponents.length).toBe(1);
  });

  it("should add multiple different components", async () => {
    const streamState: StreamState = {
      ...createInitialState(),
      threadMap: {
        "thread_123": {
          thread: {
            id: "thread_123",
            messages: [
              {
                id: "msg_1",
                role: "assistant",
                content: [
                  {
                    type: "component",
                    componentId: "comp_1",
                    componentName: "TestCard",
                    props: {
                      title: "First",
                      content: "Card",
                    },
                    streamingState: "done",
                  },
                ],
              },
              {
                id: "msg_2",
                role: "assistant",
                content: [
                  {
                    type: "component",
                    componentId: "comp_2",
                    componentName: "TestCard",
                    props: {
                      title: "Second",
                      content: "Card",
                    },
                    streamingState: "done",
                  },
                ],
              },
            ],
          },
          ...createInitialState().threadMap["__PLACEHOLDER__"],
        },
      },
      currentThreadId: "thread_123",
    };

    const { result } = renderHook(() => useTamboInteractable(), {
      wrapper: createTestWrapper({ autoInteractables: true, streamState }),
    });

    await waitFor(() => {
      expect(result.current.interactableComponents.length).toBe(2);
    });

    expect(result.current.interactableComponents[0].props.title).toBe("First");
    expect(result.current.interactableComponents[1].props.title).toBe("Second");
  });
});
