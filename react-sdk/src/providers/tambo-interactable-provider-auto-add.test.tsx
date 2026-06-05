import { act, renderHook } from "@testing-library/react";
import React from "react";
import { z } from "zod";
import { TamboInteractableComponent } from "../model/tambo-interactable";
import {
  TamboInteractableProvider,
  useTamboInteractable,
} from "./tambo-interactable-provider";
import type { StreamState } from "@tambo-ai/client";
import type { TamboComponentContent } from "../v1/types/message";

// Mock the context helpers
const mockAddContextHelper = jest.fn();
const mockRemoveContextHelper = jest.fn();

jest.mock("./tambo-context-helpers-provider", () => ({
  TamboContextHelpersProvider: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <>{children}</>,
  useTamboContextHelpers: () => ({
    addContextHelper: mockAddContextHelper,
    removeContextHelper: mockRemoveContextHelper,
  }),
}));

// Mock the registry provider
const mockRegisterTool = jest.fn();
const mockUnregisterTools = jest.fn();
const mockComponentList = [
  {
    name: "WeatherCard",
    description: "Shows weather information",
    component: () => <div>Weather</div>,
    props: z.object({
      city: z.string(),
      temperature: z.number(),
    }),
  },
];

jest.mock("./tambo-registry-provider", () => ({
  useTamboRegistry: () => ({
    registerTool: mockRegisterTool,
    unregisterTools: mockUnregisterTools,
    componentList: mockComponentList,
  }),
}));

// Mock the context helper creation
jest.mock("../context-helpers/current-interactables-context-helper", () => ({
  createInteractablesContextHelper: () =>
    jest.fn(() => ({
      name: "interactables",
      context: {
        description: "Test interactables context",
        components: [],
      },
    })),
}));

// Mock the config provider
const mockUseTamboConfig = jest.fn();
jest.mock("../v1/providers/tambo-v1-provider", () => ({
  useTamboConfig: () => mockUseTamboConfig(),
}));

// Mock the stream state provider
const mockUseStreamState = jest.fn();
jest.mock("../v1/providers/tambo-v1-stream-context", () => ({
  useStreamState: () => mockUseStreamState(),
}));

describe("TamboInteractableProvider - Auto Add Components", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <TamboInteractableProvider>{children}</TamboInteractableProvider>
  );

  it("should NOT auto-add components when autoAddInteractables is false", () => {
    mockUseTamboConfig.mockReturnValue({
      autoAddInteractables: false,
    });

    const mockStreamState: StreamState = {
      currentThreadId: "thread_1",
      threadMap: {
        thread_1: {
          thread: {
            id: "thread_1",
            messages: [
              {
                id: "msg_1",
                role: "assistant",
                content: [
                  {
                    type: "component",
                    id: "comp_123",
                    name: "WeatherCard",
                    props: { city: "SF", temperature: 72 },
                  } as TamboComponentContent,
                ],
              },
            ],
          },
          streaming: { status: "idle" },
        },
      },
    };

    mockUseStreamState.mockReturnValue(mockStreamState);

    const { result } = renderHook(() => useTamboInteractable(), { wrapper });

    // Component should NOT be auto-added
    expect(result.current.interactableComponents).toHaveLength(0);
  });

  it("should auto-add components when autoAddInteractables is true", () => {
    mockUseTamboConfig.mockReturnValue({
      autoAddInteractables: true,
    });

    const mockStreamState: StreamState = {
      currentThreadId: "thread_1",
      threadMap: {
        thread_1: {
          thread: {
            id: "thread_1",
            messages: [
              {
                id: "msg_1",
                role: "assistant",
                content: [
                  {
                    type: "component",
                    id: "comp_123",
                    name: "WeatherCard",
                    props: { city: "SF", temperature: 72 },
                  } as TamboComponentContent,
                ],
                createdAt: new Date().toISOString(),
              },
            ],
          },
          streaming: { status: "idle" },
        },
      },
    };

    mockUseStreamState.mockReturnValue(mockStreamState);

    const { result, rerender } = renderHook(() => useTamboInteractable(), {
      wrapper,
    });

    // Trigger re-render to run the effect
    rerender();

    // Component should be auto-added
    expect(result.current.interactableComponents).toHaveLength(1);
    expect(result.current.interactableComponents[0]).toMatchObject({
      id: "comp_123",
      name: "WeatherCard",
      props: { city: "SF", temperature: 72 },
    });
  });

  it("should not duplicate components when already added", () => {
    mockUseTamboConfig.mockReturnValue({
      autoAddInteractables: true,
    });

    const mockStreamState: StreamState = {
      currentThreadId: "thread_1",
      threadMap: {
        thread_1: {
          thread: {
            id: "thread_1",
            messages: [
              {
                id: "msg_1",
                role: "assistant",
                content: [
                  {
                    type: "component",
                    id: "comp_123",
                    name: "WeatherCard",
                    props: { city: "SF", temperature: 72 },
                  } as TamboComponentContent,
                ],
                createdAt: new Date().toISOString(),
              },
            ],
          },
          streaming: { status: "idle" },
        },
      },
    };

    mockUseStreamState.mockReturnValue(mockStreamState);

    const { result, rerender } = renderHook(() => useTamboInteractable(), {
      wrapper,
    });

    // Trigger re-render to run the effect
    rerender();

    expect(result.current.interactableComponents).toHaveLength(1);

    // Trigger re-render again
    rerender();

    // Should still be 1 component (not duplicated)
    expect(result.current.interactableComponents).toHaveLength(1);
  });

  it("should auto-add multiple components from different messages", () => {
    mockUseTamboConfig.mockReturnValue({
      autoAddInteractables: true,
    });

    const mockStreamState: StreamState = {
      currentThreadId: "thread_1",
      threadMap: {
        thread_1: {
          thread: {
            id: "thread_1",
            messages: [
              {
                id: "msg_1",
                role: "assistant",
                content: [
                  {
                    type: "component",
                    id: "comp_123",
                    name: "WeatherCard",
                    props: { city: "SF", temperature: 72 },
                  } as TamboComponentContent,
                ],
                createdAt: new Date().toISOString(),
              },
              {
                id: "msg_2",
                role: "assistant",
                content: [
                  {
                    type: "component",
                    id: "comp_456",
                    name: "WeatherCard",
                    props: { city: "NYC", temperature: 68 },
                  } as TamboComponentContent,
                ],
                createdAt: new Date().toISOString(),
              },
            ],
          },
          streaming: { status: "idle" },
        },
      },
    };

    mockUseStreamState.mockReturnValue(mockStreamState);

    const { result, rerender } = renderHook(() => useTamboInteractable(), {
      wrapper,
    });

    // Trigger re-render to run the effect
    rerender();

    // Both components should be auto-added
    expect(result.current.interactableComponents).toHaveLength(2);
    expect(result.current.interactableComponents[0].id).toBe("comp_123");
    expect(result.current.interactableComponents[1].id).toBe("comp_456");
  });

  it("should skip components not in the registry", () => {
    mockUseTamboConfig.mockReturnValue({
      autoAddInteractables: true,
    });

    const mockStreamState: StreamState = {
      currentThreadId: "thread_1",
      threadMap: {
        thread_1: {
          thread: {
            id: "thread_1",
            messages: [
              {
                id: "msg_1",
                role: "assistant",
                content: [
                  {
                    type: "component",
                    id: "comp_123",
                    name: "UnknownComponent",
                    props: {},
                  } as TamboComponentContent,
                ],
                createdAt: new Date().toISOString(),
              },
            ],
          },
          streaming: { status: "idle" },
        },
      },
    };

    mockUseStreamState.mockReturnValue(mockStreamState);

    const { result, rerender } = renderHook(() => useTamboInteractable(), {
      wrapper,
    });

    // Trigger re-render to run the effect
    rerender();

    // Component should NOT be added (not in registry)
    expect(result.current.interactableComponents).toHaveLength(0);
  });
});
