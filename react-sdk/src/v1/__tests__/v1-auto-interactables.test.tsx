/**
 * Tests for automatic interactables functionality
 */

import { act, renderHook } from "@testing-library/react";
import React, { useEffect } from "react";
import { z } from "zod/v3";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import { useTamboConfig } from "../providers/tambo-v1-provider";
import {
  TamboRegistryContext,
  type TamboRegistryContext as TamboRegistryContextType,
} from "../../providers/tambo-registry-provider";
import { TamboContextHelpersProvider } from "../../providers/tambo-context-helpers-provider";
import { TamboInteractableProvider } from "../../providers/tambo-interactable-provider";
import { TamboConfigContext } from "../providers/tambo-v1-provider";
import type { TamboConfig } from "../providers/tambo-v1-provider";
import {
  StreamStateContext,
  StreamDispatchContext,
  type StreamState,
} from "../providers/tambo-v1-stream-context";
import { createInitialState } from "@tambo-ai/client";
import { TamboAutoInteractablesManager } from "../providers/tambo-v1-auto-interactables";
import type { TamboComponentContent } from "../types/message";

// Mock component for testing
const MockWeatherCard: React.FC<{ city: string; temperature: number }> = ({
  city,
  temperature,
}) => (
  <div>
    {city}: {temperature}°
  </div>
);

const WeatherCardSchema = z.object({
  city: z.string(),
  temperature: z.number(),
});

// Minimal registry mock
function createMockRegistry() {
  const toolRegistry: Record<string, unknown> = {};
  const componentList = {
    WeatherCard: {
      name: "WeatherCard",
      description: "Displays weather for a city",
      component: MockWeatherCard,
      propsSchema: WeatherCardSchema,
    },
  };

  return {
    value: {
      componentList,
      toolRegistry,
      componentToolAssociations: {},
      mcpServerInfos: [],
      resources: [],
      resourceSource: null,
      onCallUnregisteredTool: undefined,
      registerComponent: jest.fn(),
      registerTool: jest.fn((tool: { name: string }) => {
        toolRegistry[tool.name] = tool;
      }),
      registerTools: jest.fn(),
      unregisterTools: jest.fn((names: string[]) => {
        for (const name of names) {
          delete toolRegistry[name];
        }
      }),
      addToolAssociation: jest.fn(),
      registerMcpServer: jest.fn(),
      registerMcpServers: jest.fn(),
      registerResource: jest.fn(),
      registerResources: jest.fn(),
      registerResourceSource: jest.fn(),
    } as unknown as TamboRegistryContextType,
  };
}

/**
 * Wrapper that provides the necessary provider tree for auto-interactables testing
 * @returns The wrapper component
 */
function AutoInteractablesWrapper({
  children,
  registry,
  config,
  streamState,
}: {
  children: React.ReactNode;
  registry: TamboRegistryContextType;
  config: TamboConfig;
  streamState: StreamState;
}) {
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);

  return (
    <TamboRegistryContext.Provider value={registry}>
      <TamboContextHelpersProvider>
        <TamboInteractableProvider>
          <TamboConfigContext.Provider value={config}>
            <StreamStateContext.Provider value={streamState}>
              <StreamDispatchContext.Provider value={() => {}}>
                <TamboAutoInteractablesManager />
                {children}
              </StreamDispatchContext.Provider>
            </StreamStateContext.Provider>
          </TamboConfigContext.Provider>
        </TamboInteractableProvider>
      </TamboContextHelpersProvider>
    </TamboRegistryContext.Provider>
  );
}

describe("Auto Interactables", () => {
  it("should not process components when autoInteractables is false", () => {
    const mockRegistry = createMockRegistry();
    const config: TamboConfig = {
      autoInteractables: false,
    };
    const streamState = createInitialState();

    const { result } = renderHook(() => useTamboInteractable(), {
      wrapper: ({ children }) => (
        <AutoInteractablesWrapper
          registry={mockRegistry.value}
          config={config}
          streamState={streamState}
        >
          {children}
        </AutoInteractablesWrapper>
      ),
    });

    expect(result.current.interactableComponents).toHaveLength(0);
  });

  it("should not process components when autoInteractables is undefined", () => {
    const mockRegistry = createMockRegistry();
    const config: TamboConfig = {};
    const streamState = createInitialState();

    const { result } = renderHook(() => useTamboInteractable(), {
      wrapper: ({ children }) => (
        <AutoInteractablesWrapper
          registry={mockRegistry.value}
          config={config}
          streamState={streamState}
        >
          {children}
        </AutoInteractablesWrapper>
      ),
    });

    expect(result.current.interactableComponents).toHaveLength(0);
  });

  it("should add finished component to interactables when autoInteractables is true", () => {
    const mockRegistry = createMockRegistry();
    const config: TamboConfig = {
      autoInteractables: true,
    };

    // Create stream state with a finished component
    const initialState = createInitialState();
    const component: TamboComponentContent = {
      type: "component",
      id: "weather-1",
      name: "WeatherCard",
      props: { city: "San Francisco", temperature: 72 },
      state: {},
      streamingState: "done",
    };

    const streamState: StreamState = {
      ...initialState,
      threadMap: {
        ...initialState.threadMap,
        "test-thread": {
          ...initialState.threadMap[initialState.currentThreadId],
          thread: {
            ...initialState.threadMap[initialState.currentThreadId].thread,
            id: "test-thread",
            messages: [
              {
                id: "msg-1",
                role: "assistant",
                content: [component],
                createdAt: new Date().toISOString(),
              },
            ],
          },
        },
      },
      currentThreadId: "test-thread",
    };

    const { result } = renderHook(() => useTamboInteractable(), {
      wrapper: ({ children }) => (
        <AutoInteractablesWrapper
          registry={mockRegistry.value}
          config={config}
          streamState={streamState}
        >
          {children}
        </AutoInteractablesWrapper>
      ),
    });

    // The component should be added to interactables
    expect(result.current.interactableComponents).toHaveLength(1);
    expect(result.current.interactableComponents[0].name).toBe("WeatherCard");
    expect(result.current.interactableComponents[0].props).toEqual({
      city: "San Francisco",
      temperature: 72,
    });
  });

  it("should not add streaming components to interactables", () => {
    const mockRegistry = createMockRegistry();
    const config: TamboConfig = {
      autoInteractables: true,
    };

    // Create stream state with a streaming (not done) component
    const initialState = createInitialState();
    const component: TamboComponentContent = {
      type: "component",
      id: "weather-1",
      name: "WeatherCard",
      props: { city: "San Francisco", temperature: 72 },
      state: {},
      streamingState: "streaming",
    };

    const streamState: StreamState = {
      ...initialState,
      threadMap: {
        ...initialState.threadMap,
        "test-thread": {
          ...initialState.threadMap[initialState.currentThreadId],
          thread: {
            ...initialState.threadMap[initialState.currentThreadId].thread,
            id: "test-thread",
            messages: [
              {
                id: "msg-1",
                role: "assistant",
                content: [component],
                createdAt: new Date().toISOString(),
              },
            ],
          },
        },
      },
      currentThreadId: "test-thread",
    };

    const { result } = renderHook(() => useTamboInteractable(), {
      wrapper: ({ children }) => (
        <AutoInteractablesWrapper
          registry={mockRegistry.value}
          config={config}
          streamState={streamState}
        >
          {children}
        </AutoInteractablesWrapper>
      ),
    });

    // The component should NOT be added because it's still streaming
    expect(result.current.interactableComponents).toHaveLength(0);
  });
});
