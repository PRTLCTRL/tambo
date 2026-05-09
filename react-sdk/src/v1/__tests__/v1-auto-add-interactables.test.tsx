import { act, render, renderHook, screen } from "@testing-library/react";
import React from "react";
import { z } from "zod/v3";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import { TamboRegistryContext } from "../../providers/tambo-registry-provider";
import type { TamboRegistryContext as TamboRegistryContextType } from "../../providers/tambo-registry-provider";
import { TamboContextHelpersProvider } from "../../providers/tambo-context-helpers-provider";
import { TamboInteractableProvider } from "../../providers/tambo-interactable-provider";
import { TamboProvider, TamboConfigContext } from "../providers/tambo-v1-provider";
import type { TamboConfig } from "../providers/tambo-v1-provider";
import { ComponentRenderer } from "../components/v1-component-renderer";
import type { TamboComponentContent } from "../types/message";

function createMockRegistry() {
  const toolRegistry: Record<string, unknown> = {};
  return {
    value: {
      componentList: {
        TestCard: {
          name: "TestCard",
          description: "A test card component",
          component: ({ title }: { title: string }) => (
            <div data-testid="card-title">{title}</div>
          ),
          props: z.object({ title: z.string() }),
        },
      },
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

function TestWrapper({
  children,
  registry,
  config,
}: {
  children: React.ReactNode;
  registry: TamboRegistryContextType;
  config: TamboConfig;
}) {
  return (
    <TamboRegistryContext.Provider value={registry}>
      <TamboContextHelpersProvider>
        <TamboInteractableProvider>
          <TamboConfigContext.Provider value={config}>
            {children}
          </TamboConfigContext.Provider>
        </TamboInteractableProvider>
      </TamboContextHelpersProvider>
    </TamboRegistryContext.Provider>
  );
}

describe("Auto-add components to interactables", () => {
  it("should automatically add components to interactables when autoAddToInteractables is true", () => {
    const mockRegistry = createMockRegistry();
    const config: TamboConfig = { autoAddToInteractables: true };

    const componentContent: TamboComponentContent = {
      type: "component",
      id: "test-component-id-123",
      name: "TestCard",
      props: { title: "Auto-added Card" },
      streamingState: "done",
    };

    const TestHarness = () => {
      const { interactableComponents } = useTamboInteractable();
      return (
        <div>
          <ComponentRenderer
            content={componentContent}
            threadId="test-thread"
            messageId="test-message"
          />
          <div data-testid="interactable-count">
            {interactableComponents.length}
          </div>
          {interactableComponents.length > 0 && (
            <div data-testid="interactable-id">
              {interactableComponents[0].id}
            </div>
          )}
        </div>
      );
    };

    render(
      <TestWrapper registry={mockRegistry.value} config={config}>
        <TestHarness />
      </TestWrapper>,
    );

    // Check that component is rendered
    expect(screen.getByTestId("card-title")).toHaveTextContent(
      "Auto-added Card",
    );

    // Check that component was automatically added to interactables
    expect(screen.getByTestId("interactable-count")).toHaveTextContent("1");

    // Check that the component ID matches the content ID
    expect(screen.getByTestId("interactable-id")).toHaveTextContent(
      "test-component-id-123",
    );
  });

  it("should NOT add components to interactables when autoAddToInteractables is false", () => {
    const mockRegistry = createMockRegistry();
    const config: TamboConfig = { autoAddToInteractables: false };

    const componentContent: TamboComponentContent = {
      type: "component",
      id: "test-component-id-456",
      name: "TestCard",
      props: { title: "Not Auto-added" },
      streamingState: "done",
    };

    const TestHarness = () => {
      const { interactableComponents } = useTamboInteractable();
      return (
        <div>
          <ComponentRenderer
            content={componentContent}
            threadId="test-thread"
            messageId="test-message"
          />
          <div data-testid="interactable-count">
            {interactableComponents.length}
          </div>
        </div>
      );
    };

    render(
      <TestWrapper registry={mockRegistry.value} config={config}>
        <TestHarness />
      </TestWrapper>,
    );

    // Check that component is rendered
    expect(screen.getByTestId("card-title")).toHaveTextContent("Not Auto-added");

    // Check that component was NOT added to interactables
    expect(screen.getByTestId("interactable-count")).toHaveTextContent("0");
  });

  it("should NOT add components to interactables when autoAddToInteractables is undefined (default)", () => {
    const mockRegistry = createMockRegistry();
    const config: TamboConfig = {};

    const componentContent: TamboComponentContent = {
      type: "component",
      id: "test-component-id-789",
      name: "TestCard",
      props: { title: "Default Behavior" },
      streamingState: "done",
    };

    const TestHarness = () => {
      const { interactableComponents } = useTamboInteractable();
      return (
        <div>
          <ComponentRenderer
            content={componentContent}
            threadId="test-thread"
            messageId="test-message"
          />
          <div data-testid="interactable-count">
            {interactableComponents.length}
          </div>
        </div>
      );
    };

    render(
      <TestWrapper registry={mockRegistry.value} config={config}>
        <TestHarness />
      </TestWrapper>,
    );

    // Check that component was NOT added to interactables (default is false)
    expect(screen.getByTestId("interactable-count")).toHaveTextContent("0");
  });

  it("should NOT add components that are still streaming", () => {
    const mockRegistry = createMockRegistry();
    const config: TamboConfig = { autoAddToInteractables: true };

    const componentContent: TamboComponentContent = {
      type: "component",
      id: "test-component-id-streaming",
      name: "TestCard",
      props: { title: "Streaming..." },
      streamingState: "streaming",
    };

    const TestHarness = () => {
      const { interactableComponents } = useTamboInteractable();
      return (
        <div>
          <ComponentRenderer
            content={componentContent}
            threadId="test-thread"
            messageId="test-message"
          />
          <div data-testid="interactable-count">
            {interactableComponents.length}
          </div>
        </div>
      );
    };

    render(
      <TestWrapper registry={mockRegistry.value} config={config}>
        <TestHarness />
      </TestWrapper>,
    );

    // Component should NOT be added while streaming
    expect(screen.getByTestId("interactable-count")).toHaveTextContent("0");
  });

  it("should add component to interactables when streaming completes", () => {
    const mockRegistry = createMockRegistry();
    const config: TamboConfig = { autoAddToInteractables: true };

    const TestHarness = () => {
    const [streamingState, setStreamingState] = React.useState<
      "streaming" | "done"
    >("streaming");
      const { interactableComponents } = useTamboInteractable();

      const componentContent: TamboComponentContent = {
        type: "component",
        id: "test-component-id-transition",
        name: "TestCard",
        props: { title: "Transitioning..." },
        streamingState,
      };

      return (
        <div>
          <ComponentRenderer
            content={componentContent}
            threadId="test-thread"
            messageId="test-message"
          />
          <button
            data-testid="finalize-btn"
            onClick={() => setStreamingState("done")}
          >
            Finalize
          </button>
          <div data-testid="interactable-count">
            {interactableComponents.length}
          </div>
        </div>
      );
    };

    render(
      <TestWrapper registry={mockRegistry.value} config={config}>
        <TestHarness />
      </TestWrapper>,
    );

    // Initially, component should NOT be added
    expect(screen.getByTestId("interactable-count")).toHaveTextContent("0");

    // Finalize streaming
    act(() => {
      screen.getByTestId("finalize-btn").click();
    });

    // Now component should be added
    expect(screen.getByTestId("interactable-count")).toHaveTextContent("1");
  });

  it("should NOT add duplicate components (same id) to interactables", () => {
    const mockRegistry = createMockRegistry();
    const config: TamboConfig = { autoAddToInteractables: true };

    const TestHarness = () => {
      const [renderCount, setRenderCount] = React.useState(0);
      const { interactableComponents } = useTamboInteractable();

      const componentContent: TamboComponentContent = {
        type: "component",
        id: "test-component-id-duplicate",
        name: "TestCard",
        props: { title: "Same ID" },
        streamingState: "done",
      };

      return (
        <div>
          <ComponentRenderer
            key={renderCount}
            content={componentContent}
            threadId="test-thread"
            messageId="test-message"
          />
          <button
            data-testid="rerender-btn"
            onClick={() => setRenderCount((c) => c + 1)}
          >
            Re-render
          </button>
          <div data-testid="interactable-count">
            {interactableComponents.length}
          </div>
        </div>
      );
    };

    render(
      <TestWrapper registry={mockRegistry.value} config={config}>
        <TestHarness />
      </TestWrapper>,
    );

    // Component should be added once
    expect(screen.getByTestId("interactable-count")).toHaveTextContent("1");

    // Re-render with same component
    act(() => {
      screen.getByTestId("rerender-btn").click();
    });

    // Should still only have one component (no duplicates)
    expect(screen.getByTestId("interactable-count")).toHaveTextContent("1");
  });

  it("should register update tools for auto-added components", () => {
    const mockRegistry = createMockRegistry();
    const config: TamboConfig = { autoAddToInteractables: true };

    const componentContent: TamboComponentContent = {
      type: "component",
      id: "test-component-with-tools",
      name: "TestCard",
      props: { title: "With Tools" },
      streamingState: "done",
    };

    render(
      <TestWrapper registry={mockRegistry.value} config={config}>
        <ComponentRenderer
          content={componentContent}
          threadId="test-thread"
          messageId="test-message"
        />
      </TestWrapper>,
    );

    const toolNames = mockRegistry.getRegisteredToolNames();

    // Should register both update_component_props and update_component_state tools
    expect(
      toolNames.some((n) =>
        n.startsWith("update_component_props_test-component-with-tools"),
      ),
    ).toBe(true);
    expect(
      toolNames.some((n) =>
        n.startsWith("update_component_state_test-component-with-tools"),
      ),
    ).toBe(true);
  });
});
