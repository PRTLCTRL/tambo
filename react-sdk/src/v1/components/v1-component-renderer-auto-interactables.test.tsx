import { act, render, renderHook, screen } from "@testing-library/react";
import React from "react";
import { z } from "zod/v3";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import {
  TamboRegistryContext,
  type TamboRegistryContext as TamboRegistryContextType,
} from "../../providers/tambo-registry-provider";
import { TamboContextHelpersProvider } from "../../providers/tambo-context-helpers-provider";
import { TamboInteractableProvider } from "../../providers/tambo-interactable-provider";
import {
  TamboConfigContext,
  type TamboConfig,
} from "../providers/tambo-v1-provider";
import { ComponentRenderer } from "./v1-component-renderer";
import type { TamboComponentContent } from "../types/message";

function createMockRegistry() {
  const toolRegistry: Record<string, unknown> = {};
  const componentList: Record<string, unknown> = {
    TestComponent: {
      name: "TestComponent",
      description: "A test component",
      component: ({ label }: { label: string }) => <div>{label}</div>,
      props: z.object({ label: z.string() }),
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

describe("ComponentRenderer with autoAddToInteractables", () => {
  it("does not add components to interactables when autoAddToInteractables is false", () => {
    const mockRegistry = createMockRegistry();
    const config: TamboConfig = {
      autoAddToInteractables: false,
    };

    const content: TamboComponentContent = {
      type: "component",
      id: "test-1",
      name: "TestComponent",
      props: { label: "Hello" },
    };

    const { result } = renderHook(() => useTamboInteractable(), {
      wrapper: ({ children }) => (
        <TestWrapper registry={mockRegistry.value} config={config}>
          <ComponentRenderer
            content={content}
            threadId="thread-1"
            messageId="msg-1"
          />
          {children}
        </TestWrapper>
      ),
    });

    expect(result.current.interactableComponents).toHaveLength(0);
  });

  it("adds components to interactables when autoAddToInteractables is true", async () => {
    const mockRegistry = createMockRegistry();
    const config: TamboConfig = {
      autoAddToInteractables: true,
    };

    const content: TamboComponentContent = {
      type: "component",
      id: "test-1",
      name: "TestComponent",
      props: { label: "Hello" },
    };

    let hookResult: ReturnType<typeof useTamboInteractable>;

    await act(async () => {
      const { result } = renderHook(() => useTamboInteractable(), {
        wrapper: ({ children }) => (
          <TestWrapper registry={mockRegistry.value} config={config}>
            <ComponentRenderer
              content={content}
              threadId="thread-1"
              messageId="msg-1"
            />
            {children}
          </TestWrapper>
        ),
      });
      hookResult = result.current;

      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(hookResult!.interactableComponents.length).toBeGreaterThan(0);
    expect(hookResult!.interactableComponents[0].name).toBe("TestComponent");
    expect(hookResult!.interactableComponents[0].props).toEqual({
      label: "Hello",
    });
  });

  it("registers update tools for auto-added interactables", async () => {
    const mockRegistry = createMockRegistry();
    const config: TamboConfig = {
      autoAddToInteractables: true,
    };

    const content: TamboComponentContent = {
      type: "component",
      id: "test-1",
      name: "TestComponent",
      props: { label: "Hello" },
    };

    await act(async () => {
      render(
        <TestWrapper registry={mockRegistry.value} config={config}>
          <ComponentRenderer
            content={content}
            threadId="thread-1"
            messageId="msg-1"
          />
        </TestWrapper>,
      );

      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const toolNames = mockRegistry.getRegisteredToolNames();
    expect(
      toolNames.some((n) => n.startsWith("update_component_props_")),
    ).toBe(true);
    expect(
      toolNames.some((n) => n.startsWith("update_component_state_")),
    ).toBe(true);
  });

  it("renders the component correctly with autoAddToInteractables enabled", async () => {
    const mockRegistry = createMockRegistry();
    const config: TamboConfig = {
      autoAddToInteractables: true,
    };

    const content: TamboComponentContent = {
      type: "component",
      id: "test-1",
      name: "TestComponent",
      props: { label: "Test Label" },
    };

    await act(async () => {
      render(
        <TestWrapper registry={mockRegistry.value} config={config}>
          <ComponentRenderer
            content={content}
            threadId="thread-1"
            messageId="msg-1"
          />
        </TestWrapper>,
      );

      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(screen.getByText("Test Label")).toBeInTheDocument();
  });
});
