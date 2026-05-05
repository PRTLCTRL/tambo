import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import React from "react";
import { z } from "zod/v3";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import {
  TamboRegistryContext,
  type TamboRegistryContext as TamboRegistryContextType,
} from "../../providers/tambo-registry-provider";
import { TamboContextHelpersProvider } from "../../providers/tambo-context-helpers-provider";
import { TamboInteractableProvider } from "../../providers/tambo-interactable-provider";
import { TamboConfigContext, type TamboConfig } from "../providers/tambo-v1-provider";
import { ComponentRenderer } from "./v1-component-renderer";
import type { TamboComponentContent } from "../types/message";

// Minimal registry mock
function createMockRegistry() {
  const componentList = {
    TestCard: {
      component: ({ title }: { title: string }) => <div data-testid="test-card">{title}</div>,
      description: "A test card",
      props: z.object({ title: z.string() }),
    },
    AnotherComponent: {
      component: ({ label }: { label: string }) => <div data-testid="another-comp">{label}</div>,
      description: "Another component",
      props: z.object({ label: z.string() }),
    },
  };

  return {
    value: {
      componentList,
      toolRegistry: {},
      componentToolAssociations: {},
      mcpServerInfos: [],
      resources: [],
      resourceSource: null,
      onCallUnregisteredTool: undefined,
      registerComponent: jest.fn(),
      registerTool: jest.fn(),
      registerTools: jest.fn(),
      unregisterTools: jest.fn(),
      addToolAssociation: jest.fn(),
      registerMcpServer: jest.fn(),
      registerMcpServers: jest.fn(),
      registerResource: jest.fn(),
      registerResources: jest.fn(),
      registerResourceSource: jest.fn(),
    } as unknown as TamboRegistryContextType,
  };
}

interface WrapperProps {
  children: React.ReactNode;
  registry: TamboRegistryContextType;
  config?: TamboConfig;
}

function TestWrapper({ children, registry, config = {} }: WrapperProps) {
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

describe("ComponentRenderer - Auto-register Interactables", () => {
  it("should NOT auto-register component when autoRegisterInteractables is false", async () => {
    const mockRegistry = createMockRegistry();
    const content: TamboComponentContent = {
      type: "component",
      id: "comp-1",
      name: "TestCard",
      props: { title: "Hello" },
      streamingState: "complete",
    };

    function TestHarness() {
      const { interactableComponents } = useTamboInteractable();
      return (
        <div>
          <ComponentRenderer
            content={content}
            threadId="thread-1"
            messageId="msg-1"
          />
          <div data-testid="interactable-count">
            {interactableComponents.length}
          </div>
        </div>
      );
    }

    render(
      <TestWrapper
        registry={mockRegistry.value}
        config={{ autoRegisterInteractables: false }}
      >
        <TestHarness />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId("test-card")).toBeInTheDocument();
    });

    expect(screen.getByTestId("interactable-count")).toHaveTextContent("0");
  });

  it("should auto-register component when autoRegisterInteractables is true", async () => {
    const mockRegistry = createMockRegistry();
    const content: TamboComponentContent = {
      type: "component",
      id: "comp-2",
      name: "TestCard",
      props: { title: "Auto-registered" },
      streamingState: "complete",
    };

    function TestHarness() {
      const { interactableComponents } = useTamboInteractable();
      return (
        <div>
          <ComponentRenderer
            content={content}
            threadId="thread-1"
            messageId="msg-1"
          />
          <div data-testid="interactable-count">
            {interactableComponents.length}
          </div>
          {interactableComponents.length > 0 && (
            <div data-testid="interactable-name">
              {interactableComponents[0].name}
            </div>
          )}
        </div>
      );
    }

    render(
      <TestWrapper
        registry={mockRegistry.value}
        config={{ autoRegisterInteractables: true }}
      >
        <TestHarness />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId("test-card")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByTestId("interactable-count")).toHaveTextContent("1");
    });

    expect(screen.getByTestId("interactable-name")).toHaveTextContent("TestCard");
  });

  it("should update existing interactable when rendering same component name again", async () => {
    const mockRegistry = createMockRegistry();
    const content1: TamboComponentContent = {
      type: "component",
      id: "comp-3a",
      name: "TestCard",
      props: { title: "First" },
      streamingState: "complete",
    };
    const content2: TamboComponentContent = {
      type: "component",
      id: "comp-3b",
      name: "TestCard",
      props: { title: "Updated" },
      streamingState: "complete",
    };

    function TestHarness() {
      const { interactableComponents } = useTamboInteractable();
      const [showSecond, setShowSecond] = React.useState(false);

      return (
        <div>
          <ComponentRenderer
            content={content1}
            threadId="thread-1"
            messageId="msg-1"
          />
          {showSecond && (
            <ComponentRenderer
              content={content2}
              threadId="thread-1"
              messageId="msg-2"
            />
          )}
          <button
            data-testid="show-second"
            onClick={() => setShowSecond(true)}
          >
            Show Second
          </button>
          <div data-testid="interactable-count">
            {interactableComponents.length}
          </div>
          {interactableComponents.length > 0 && (
            <div data-testid="interactable-props">
              {JSON.stringify(interactableComponents[0].props)}
            </div>
          )}
        </div>
      );
    }

    const { getByTestId } = render(
      <TestWrapper
        registry={mockRegistry.value}
        config={{ autoRegisterInteractables: true }}
      >
        <TestHarness />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId("test-card")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(getByTestId("interactable-count")).toHaveTextContent("1");
    });

    // Check initial props
    expect(getByTestId("interactable-props")).toHaveTextContent(
      JSON.stringify({ title: "First" }),
    );

    // Show second renderer with same component name but different props
    act(() => {
      getByTestId("show-second").click();
    });

    // Should still only have 1 interactable, but with updated props
    await waitFor(() => {
      expect(getByTestId("interactable-count")).toHaveTextContent("1");
    });

    await waitFor(() => {
      expect(getByTestId("interactable-props")).toHaveTextContent(
        JSON.stringify({ title: "Updated" }),
      );
    });
  });

  it("should auto-register multiple different components", async () => {
    const mockRegistry = createMockRegistry();
    const content1: TamboComponentContent = {
      type: "component",
      id: "comp-4",
      name: "TestCard",
      props: { title: "First" },
      streamingState: "complete",
    };
    const content2: TamboComponentContent = {
      type: "component",
      id: "comp-5",
      name: "AnotherComponent",
      props: { label: "Second" },
      streamingState: "complete",
    };

    function TestHarness() {
      const { interactableComponents } = useTamboInteractable();
      return (
        <div>
          <ComponentRenderer
            content={content1}
            threadId="thread-1"
            messageId="msg-1"
          />
          <ComponentRenderer
            content={content2}
            threadId="thread-1"
            messageId="msg-2"
          />
          <div data-testid="interactable-count">
            {interactableComponents.length}
          </div>
        </div>
      );
    }

    render(
      <TestWrapper
        registry={mockRegistry.value}
        config={{ autoRegisterInteractables: true }}
      >
        <TestHarness />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId("test-card")).toBeInTheDocument();
      expect(screen.getByTestId("another-comp")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByTestId("interactable-count")).toHaveTextContent("2");
    });
  });

  it("should handle component not in registry gracefully", async () => {
    const mockRegistry = createMockRegistry();
    const content: TamboComponentContent = {
      type: "component",
      id: "comp-6",
      name: "NonExistentComponent",
      props: {},
      streamingState: "complete",
    };

    const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();

    function TestHarness() {
      const { interactableComponents } = useTamboInteractable();
      return (
        <div>
          <ComponentRenderer
            content={content}
            threadId="thread-1"
            messageId="msg-1"
            fallback={<div data-testid="fallback">Fallback</div>}
          />
          <div data-testid="interactable-count">
            {interactableComponents.length}
          </div>
        </div>
      );
    }

    render(
      <TestWrapper
        registry={mockRegistry.value}
        config={{ autoRegisterInteractables: true }}
      >
        <TestHarness />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId("fallback")).toBeInTheDocument();
    });

    expect(screen.getByTestId("interactable-count")).toHaveTextContent("0");
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to auto-register interactable"),
      expect.any(Error),
    );

    consoleWarnSpy.mockRestore();
  });

  it("should include props and schema when auto-registering", async () => {
    const mockRegistry = createMockRegistry();
    const content: TamboComponentContent = {
      type: "component",
      id: "comp-7",
      name: "TestCard",
      props: { title: "Test Props" },
      streamingState: "complete",
    };

    const { result } = renderHook(() => useTamboInteractable(), {
      wrapper: ({ children }) => (
        <TestWrapper
          registry={mockRegistry.value}
          config={{ autoRegisterInteractables: true }}
        >
          <ComponentRenderer
            content={content}
            threadId="thread-1"
            messageId="msg-1"
          />
          {children}
        </TestWrapper>
      ),
    });

    await waitFor(() => {
      expect(result.current.interactableComponents).toHaveLength(1);
    });

    const interactable = result.current.interactableComponents[0];
    expect(interactable.name).toBe("TestCard");
    expect(interactable.props).toEqual({ title: "Test Props" });
    expect(interactable.propsSchema).toBeDefined();
  });
});
