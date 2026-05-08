import { act, render, renderHook, screen } from "@testing-library/react";
import React, { useReducer } from "react";
import { z } from "zod/v3";
import { withTamboInteractable } from "../../hoc/with-tambo-interactable";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import { useTamboContextHelpers } from "../../providers/tambo-context-helpers-provider";
import {
  TamboRegistryContext,
  type TamboRegistryContext as TamboRegistryContextType,
} from "../../providers/tambo-registry-provider";
import { TamboContextHelpersProvider } from "../../providers/tambo-context-helpers-provider";
import { TamboInteractableProvider } from "../../providers/tambo-interactable-provider";
import { TamboConfigContext } from "../providers/tambo-v1-provider";
import { TamboStreamProvider } from "../providers/tambo-v1-stream-context";
import { streamReducer, createInitialState, type StreamState } from "@tambo-ai/client";

// Minimal registry mock that captures registered tools
function createMockRegistry() {
  const toolRegistry: Record<string, unknown> = {};
  return {
    value: {
      componentList: {},
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
    getRegisteredToolNames: () => Object.keys(toolRegistry),
  };
}

/**
 * Wrapper that provides the minimal provider tree for interactables:
 * TamboRegistryContext > TamboContextHelpersProvider > TamboInteractableProvider
 * @returns The wrapper component.
 */
function V1InteractableWrapper({
  children,
  registry,
}: {
  children: React.ReactNode;
  registry: TamboRegistryContextType;
}) {
  return (
    <TamboRegistryContext.Provider value={registry}>
      <TamboContextHelpersProvider>
        <TamboInteractableProvider>{children}</TamboInteractableProvider>
      </TamboContextHelpersProvider>
    </TamboRegistryContext.Provider>
  );
}

describe("V1 Interactables Integration", () => {
  it("registers update_component_props and update_component_state tools when an interactable is added", () => {
    const mockRegistry = createMockRegistry();

    const { result } = renderHook(() => useTamboInteractable(), {
      wrapper: ({ children }) => (
        <V1InteractableWrapper registry={mockRegistry.value}>
          {children}
        </V1InteractableWrapper>
      ),
    });

    act(() => {
      result.current.addInteractableComponent({
        name: "TestWidget",
        description: "A test widget",
        component: () => <div>widget</div>,
        props: { label: "hello" },
        propsSchema: z.object({ label: z.string() }),
      });
    });

    const toolNames = mockRegistry.getRegisteredToolNames();
    expect(
      toolNames.some((n) => n.startsWith("update_component_props_TestWidget")),
    ).toBe(true);
    expect(
      toolNames.some((n) => n.startsWith("update_component_state_TestWidget")),
    ).toBe(true);
  });

  it("registers interactables context helper that includes component info", async () => {
    const mockRegistry = createMockRegistry();

    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        helpers: useTamboContextHelpers(),
      }),
      {
        wrapper: ({ children }) => (
          <V1InteractableWrapper registry={mockRegistry.value}>
            {children}
          </V1InteractableWrapper>
        ),
      },
    );

    // Add an interactable component
    act(() => {
      result.current.interactable.addInteractableComponent({
        name: "InfoCard",
        description: "An info card",
        component: () => <div>card</div>,
        props: { title: "Test" },
      });
    });

    // Get additional context - should include interactable info
    const contexts = await act(async () => {
      return await result.current.helpers.getAdditionalContext();
    });

    const interactablesContext = contexts.find(
      (c) => c.name === "interactables",
    );
    expect(interactablesContext).toBeDefined();
    expect(interactablesContext?.context).toBeDefined();
  });

  it("renders an interactable component via withTamboInteractable HOC", () => {
    const mockRegistry = createMockRegistry();

    interface CardProps {
      title: string;
    }

    const Card: React.FC<CardProps> = ({ title }) => (
      <div data-testid="card-title">{title}</div>
    );

    const InteractableCard = withTamboInteractable(Card, {
      componentName: "Card",
      description: "A card component",
      propsSchema: z.object({ title: z.string() }),
    });

    render(
      <V1InteractableWrapper registry={mockRegistry.value}>
        <InteractableCard title="Hello V1" />
      </V1InteractableWrapper>,
    );

    expect(screen.getByTestId("card-title")).toHaveTextContent("Hello V1");
  });

  it("updates component props via the interactable provider", () => {
    const mockRegistry = createMockRegistry();

    interface CounterProps {
      count: number;
    }

    const Counter: React.FC<CounterProps> = ({ count }) => (
      <div data-testid="count">{count}</div>
    );

    const InteractableCounter = withTamboInteractable(Counter, {
      componentName: "Counter",
      description: "A counter",
      propsSchema: z.object({ count: z.number() }),
    });

    // Inner component that triggers prop updates
    function TestHarness() {
      const { interactableComponents, updateInteractableComponentProps } =
        useTamboInteractable();
      const component = interactableComponents[0];

      return (
        <div>
          <InteractableCounter count={0} />
          {component && (
            <button
              data-testid="update-btn"
              onClick={() =>
                updateInteractableComponentProps(component.id, { count: 42 })
              }
            >
              Update
            </button>
          )}
        </div>
      );
    }

    render(
      <V1InteractableWrapper registry={mockRegistry.value}>
        <TestHarness />
      </V1InteractableWrapper>,
    );

    // Initial render
    expect(screen.getByTestId("count")).toHaveTextContent("0");

    // Update props via the interactable provider
    act(() => {
      screen.getByTestId("update-btn").click();
    });

    // The interactable should reflect updated props
    expect(screen.getByTestId("count")).toHaveTextContent("42");
  });

  describe("autoAddComponentsToInteractables", () => {
    it("automatically adds AI-generated components to interactables when enabled", () => {
      const mockRegistry = createMockRegistry();

      // Register a test component in the registry
      const TestCard: React.FC<{ title: string }> = ({ title }) => (
        <div>{title}</div>
      );

      mockRegistry.value.componentList = {
        TestCard: {
          name: "TestCard",
          description: "A test card",
          component: TestCard,
          props: z.object({ title: z.string() }),
        },
      };

      // Create a stream state with a message containing a component
      const initialState: StreamState = {
        currentThreadId: "thread-1",
        threadMap: {
          "thread-1": {
            threadId: "thread-1",
            messages: [
              {
                id: "msg-1",
                role: "assistant",
                content: [
                  {
                    type: "component",
                    id: "comp-1",
                    name: "TestCard",
                    props: { title: "Auto-added" },
                    state: {},
                    streamingState: "complete",
                  },
                ],
                createdAt: new Date().toISOString(),
              },
            ],
            isStreamActive: false,
          },
        },
      };

      function WrapperWithConfig({ children }: { children: React.ReactNode }) {
        const [state, dispatch] = useReducer(streamReducer, initialState);
        
        return (
          <TamboConfigContext.Provider
            value={{ autoAddComponentsToInteractables: true }}
          >
            <TamboRegistryContext.Provider value={mockRegistry.value}>
              <TamboContextHelpersProvider>
                <TamboStreamProvider
                  state={state}
                  dispatch={dispatch}
                  threadManagement={{
                    initThread: jest.fn(),
                    switchThread: jest.fn(),
                    startNewThread: jest.fn(() => "new-thread"),
                  }}
                >
                  {children}
                </TamboStreamProvider>
              </TamboContextHelpersProvider>
            </TamboRegistryContext.Provider>
          </TamboConfigContext.Provider>
        );
      }

      const { result } = renderHook(() => useTamboInteractable(), {
        wrapper: WrapperWithConfig,
      });

      // Wait for the effect to run
      act(() => {
        // Force a re-render to ensure effects run
      });

      // The component should have been automatically added to interactables
      expect(result.current.interactableComponents.length).toBeGreaterThan(0);
      const addedComponent = result.current.interactableComponents.find(
        (c) => c.name === "TestCard",
      );
      expect(addedComponent).toBeDefined();
      expect(addedComponent?.props).toEqual({ title: "Auto-added" });
    });

    it("does not auto-add components when feature is disabled", () => {
      const mockRegistry = createMockRegistry();

      const TestCard: React.FC<{ title: string }> = ({ title }) => (
        <div>{title}</div>
      );

      mockRegistry.value.componentList = {
        TestCard: {
          name: "TestCard",
          description: "A test card",
          component: TestCard,
          props: z.object({ title: z.string() }),
        },
      };

      const initialState: StreamState = {
        currentThreadId: "thread-1",
        threadMap: {
          "thread-1": {
            threadId: "thread-1",
            messages: [
              {
                id: "msg-1",
                role: "assistant",
                content: [
                  {
                    type: "component",
                    id: "comp-1",
                    name: "TestCard",
                    props: { title: "Not auto-added" },
                    state: {},
                    streamingState: "complete",
                  },
                ],
                createdAt: new Date().toISOString(),
              },
            ],
            isStreamActive: false,
          },
        },
      };

      function WrapperWithConfig({ children }: { children: React.ReactNode }) {
        const [state, dispatch] = useReducer(streamReducer, initialState);
        
        return (
          <TamboConfigContext.Provider
            value={{ autoAddComponentsToInteractables: false }}
          >
            <TamboRegistryContext.Provider value={mockRegistry.value}>
              <TamboContextHelpersProvider>
                <TamboStreamProvider
                  state={state}
                  dispatch={dispatch}
                  threadManagement={{
                    initThread: jest.fn(),
                    switchThread: jest.fn(),
                    startNewThread: jest.fn(() => "new-thread"),
                  }}
                >
                  {children}
                </TamboStreamProvider>
              </TamboContextHelpersProvider>
            </TamboRegistryContext.Provider>
          </TamboConfigContext.Provider>
        );
      }

      const { result } = renderHook(() => useTamboInteractable(), {
        wrapper: WrapperWithConfig,
      });

      // Components should NOT be auto-added
      expect(result.current.interactableComponents).toHaveLength(0);
    });
  });
});
