import { render, renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { z } from "zod/v3";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import { TamboInteractableProvider } from "../../providers/tambo-interactable-provider";
import { TamboContextHelpersProvider } from "../../providers/tambo-context-helpers-provider";
import {
  TamboRegistryContext,
  type TamboRegistryContext as TamboRegistryContextType,
} from "../../providers/tambo-registry-provider";
import {
  TamboConfigContext,
  type TamboConfig,
} from "../providers/tambo-v1-provider";
import { ComponentRenderer } from "./v1-component-renderer";
import type { TamboComponentContent } from "../types/message";

function createMockRegistry() {
  return {
    componentList: {
      TestCard: {
        name: "TestCard",
        description: "A test card component",
        component: ({ title }: { title: string }) => <div>{title}</div>,
        props: z.object({ title: z.string() }),
      },
    },
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
  } as unknown as TamboRegistryContextType;
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

describe("ComponentRenderer - Auto Interactables", () => {
  it("does not auto-register when autoAddComponentsToInteractables is false", () => {
    const mockRegistry = createMockRegistry();
    const config: TamboConfig = {
      autoAddComponentsToInteractables: false,
    };

    const content: TamboComponentContent = {
      type: "component",
      id: "test-1",
      name: "TestCard",
      props: { title: "Hello" },
    };

    const { result } = renderHook(() => useTamboInteractable(), {
      wrapper: ({ children }) => (
        <TestWrapper registry={mockRegistry} config={config}>
          {children}
          <ComponentRenderer
            content={content}
            threadId="thread-1"
            messageId="msg-1"
          />
        </TestWrapper>
      ),
    });

    expect(result.current.interactableComponents).toHaveLength(0);
  });

  it("auto-registers component when autoAddComponentsToInteractables is true", async () => {
    const mockRegistry = createMockRegistry();
    const config: TamboConfig = {
      autoAddComponentsToInteractables: true,
    };

    const content: TamboComponentContent = {
      type: "component",
      id: "test-2",
      name: "TestCard",
      props: { title: "Auto Hello" },
    };

    const { result } = renderHook(() => useTamboInteractable(), {
      wrapper: ({ children }) => (
        <TestWrapper registry={mockRegistry} config={config}>
          {children}
          <ComponentRenderer
            content={content}
            threadId="thread-1"
            messageId="msg-1"
          />
        </TestWrapper>
      ),
    });

    await waitFor(() => {
      expect(result.current.interactableComponents.length).toBeGreaterThan(0);
    });

    const registered = result.current.interactableComponents[0];
    expect(registered.name).toBe("TestCard");
    expect(registered.props).toEqual({ title: "Auto Hello" });
  });

  it("registers multiple components as separate interactables", async () => {
    const mockRegistry = createMockRegistry();
    const config: TamboConfig = {
      autoAddComponentsToInteractables: true,
    };

    const content1: TamboComponentContent = {
      type: "component",
      id: "test-3",
      name: "TestCard",
      props: { title: "First" },
    };

    const content2: TamboComponentContent = {
      type: "component",
      id: "test-4",
      name: "TestCard",
      props: { title: "Second" },
    };

    const { result } = renderHook(() => useTamboInteractable(), {
      wrapper: ({ children }) => (
        <TestWrapper registry={mockRegistry} config={config}>
          {children}
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
        </TestWrapper>
      ),
    });

    await waitFor(() => {
      expect(result.current.interactableComponents).toHaveLength(2);
    });

    const [first, second] = result.current.interactableComponents;
    expect(first.name).toBe("TestCard");
    expect(first.props).toEqual({ title: "First" });
    expect(second.name).toBe("TestCard");
    expect(second.props).toEqual({ title: "Second" });
  });

  it("does not register the same component twice on re-render", async () => {
    const mockRegistry = createMockRegistry();
    const config: TamboConfig = {
      autoAddComponentsToInteractables: true,
    };

    const content: TamboComponentContent = {
      type: "component",
      id: "test-5",
      name: "TestCard",
      props: { title: "Stable" },
    };

    const { result, rerender } = renderHook(() => useTamboInteractable(), {
      wrapper: ({ children }) => (
        <TestWrapper registry={mockRegistry} config={config}>
          {children}
          <ComponentRenderer
            content={content}
            threadId="thread-1"
            messageId="msg-1"
          />
        </TestWrapper>
      ),
    });

    await waitFor(() => {
      expect(result.current.interactableComponents).toHaveLength(1);
    });

    const firstCount = result.current.interactableComponents.length;

    rerender();

    await waitFor(() => {
      expect(result.current.interactableComponents).toHaveLength(firstCount);
    });
  });

  it("handles components not in registry gracefully", () => {
    const mockRegistry = createMockRegistry();
    const config: TamboConfig = {
      autoAddComponentsToInteractables: true,
    };

    const content: TamboComponentContent = {
      type: "component",
      id: "test-6",
      name: "UnknownComponent",
      props: {},
    };

    const { result } = renderHook(() => useTamboInteractable(), {
      wrapper: ({ children }) => (
        <TestWrapper registry={mockRegistry} config={config}>
          {children}
          <ComponentRenderer
            content={content}
            threadId="thread-1"
            messageId="msg-1"
            fallback={<div>Not found</div>}
          />
        </TestWrapper>
      ),
    });

    expect(result.current.interactableComponents).toHaveLength(0);
  });
});
