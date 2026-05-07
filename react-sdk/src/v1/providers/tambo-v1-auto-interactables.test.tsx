import { act, renderHook } from "@testing-library/react";
import React from "react";
import { z } from "zod/v3";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import {
  TamboRegistryContext,
  type TamboRegistryContext as TamboRegistryContextType,
} from "../../providers/tambo-registry-provider";
import { TamboContextHelpersProvider } from "../../providers/tambo-context-helpers-provider";
import { TamboInteractableProvider } from "../../providers/tambo-interactable-provider";
import { TamboStreamProvider } from "./tambo-v1-stream-context";
import { useStreamDispatch } from "./tambo-v1-stream-context";
import type {
  TamboComponentContent,
  TamboThreadMessage,
} from "../types/message";

function createMockRegistry() {
  const toolRegistry: Record<string, unknown> = {};
  const componentList = {
    TestCard: {
      name: "TestCard",
      description: "A test card component",
      component: () => <div>Test Card</div>,
      props: z.object({ title: z.string() }),
    },
    Counter: {
      name: "Counter",
      description: "A counter component",
      component: () => <div>Counter</div>,
      props: z.object({ count: z.number() }),
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

function Wrapper({
  children,
  registry,
  autoAddComponents = false,
}: {
  children: React.ReactNode;
  registry: TamboRegistryContextType;
  autoAddComponents?: boolean;
}) {
  return (
    <TamboRegistryContext.Provider value={registry}>
      <TamboContextHelpersProvider>
        <TamboInteractableProvider autoAddComponents={autoAddComponents}>
          <TamboStreamProvider>{children}</TamboStreamProvider>
        </TamboInteractableProvider>
      </TamboContextHelpersProvider>
    </TamboRegistryContext.Provider>
  );
}

describe("Auto Interactables", () => {
  it("does not auto-register components when autoAddComponents is false", () => {
    const mockRegistry = createMockRegistry();

    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        dispatch: useStreamDispatch(),
      }),
      {
        wrapper: ({ children }) => (
          <Wrapper registry={mockRegistry.value} autoAddComponents={false}>
            {children}
          </Wrapper>
        ),
      },
    );

    const componentContent: TamboComponentContent = {
      type: "component",
      id: "test-card-1",
      name: "TestCard",
      props: { title: "Hello" },
      streamingState: "done",
    };

    const message: TamboThreadMessage = {
      id: "msg_1",
      role: "assistant",
      content: [componentContent],
    };

    act(() => {
      result.current.dispatch({
        type: "LOAD_THREAD_MESSAGES",
        threadId: "__placeholder__",
        messages: [message],
        skipIfStreaming: false,
      });
    });

    expect(result.current.interactable.interactableComponents).toHaveLength(0);
  });

  it("auto-registers components when autoAddComponents is true", async () => {
    const mockRegistry = createMockRegistry();

    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        dispatch: useStreamDispatch(),
      }),
      {
        wrapper: ({ children }) => (
          <Wrapper registry={mockRegistry.value} autoAddComponents={true}>
            {children}
          </Wrapper>
        ),
      },
    );

    const componentContent: TamboComponentContent = {
      type: "component",
      id: "test-card-1",
      name: "TestCard",
      props: { title: "Hello" },
      streamingState: "done",
    };

    const message: TamboThreadMessage = {
      id: "msg_1",
      role: "assistant",
      content: [componentContent],
    };

    act(() => {
      result.current.dispatch({
        type: "LOAD_THREAD_MESSAGES",
        threadId: "__placeholder__",
        messages: [message],
        skipIfStreaming: false,
      });
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.interactable.interactableComponents.length).toBeGreaterThan(
      0,
    );
    const registered = result.current.interactable.interactableComponents.find(
      (c) => c.name === "TestCard",
    );
    expect(registered).toBeDefined();
    expect(registered?.props).toEqual({ title: "Hello" });
  });

  it("does not register the same component twice", async () => {
    const mockRegistry = createMockRegistry();

    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        dispatch: useStreamDispatch(),
      }),
      {
        wrapper: ({ children }) => (
          <Wrapper registry={mockRegistry.value} autoAddComponents={true}>
            {children}
          </Wrapper>
        ),
      },
    );

    const componentContent: TamboComponentContent = {
      type: "component",
      id: "test-card-1",
      name: "TestCard",
      props: { title: "Hello" },
      streamingState: "done",
    };

    const message: TamboThreadMessage = {
      id: "msg_1",
      role: "assistant",
      content: [componentContent],
    };

    act(() => {
      result.current.dispatch({
        type: "LOAD_THREAD_MESSAGES",
        threadId: "__placeholder__",
        messages: [message],
        skipIfStreaming: false,
      });
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const countBefore =
      result.current.interactable.interactableComponents.length;

    act(() => {
      result.current.dispatch({
        type: "LOAD_THREAD_MESSAGES",
        threadId: "__placeholder__",
        messages: [message],
        skipIfStreaming: false,
      });
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.interactable.interactableComponents).toHaveLength(
      countBefore,
    );
  });

  it("registers multiple different components", async () => {
    const mockRegistry = createMockRegistry();

    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        dispatch: useStreamDispatch(),
      }),
      {
        wrapper: ({ children }) => (
          <Wrapper registry={mockRegistry.value} autoAddComponents={true}>
            {children}
          </Wrapper>
        ),
      },
    );

    const component1: TamboComponentContent = {
      type: "component",
      id: "test-card-1",
      name: "TestCard",
      props: { title: "Card 1" },
      streamingState: "done",
    };

    const component2: TamboComponentContent = {
      type: "component",
      id: "counter-1",
      name: "Counter",
      props: { count: 5 },
      streamingState: "done",
    };

    const messages: TamboThreadMessage[] = [
      {
        id: "msg_1",
        role: "assistant",
        content: [component1],
      },
      {
        id: "msg_2",
        role: "assistant",
        content: [component2],
      },
    ];

    act(() => {
      result.current.dispatch({
        type: "LOAD_THREAD_MESSAGES",
        threadId: "__placeholder__",
        messages,
        skipIfStreaming: false,
      });
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.interactable.interactableComponents.length).toBeGreaterThanOrEqual(
      2,
    );

    const testCard = result.current.interactable.interactableComponents.find(
      (c) => c.name === "TestCard",
    );
    const counter = result.current.interactable.interactableComponents.find(
      (c) => c.name === "Counter",
    );

    expect(testCard).toBeDefined();
    expect(counter).toBeDefined();
  });

  it("skips components not in the registry", async () => {
    const mockRegistry = createMockRegistry();

    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        dispatch: useStreamDispatch(),
      }),
      {
        wrapper: ({ children }) => (
          <Wrapper registry={mockRegistry.value} autoAddComponents={true}>
            {children}
          </Wrapper>
        ),
      },
    );

    const componentContent: TamboComponentContent = {
      type: "component",
      id: "unknown-1",
      name: "UnknownComponent",
      props: {},
      streamingState: "done",
    };

    const message: TamboThreadMessage = {
      id: "msg_1",
      role: "assistant",
      content: [componentContent],
    };

    act(() => {
      result.current.dispatch({
        type: "LOAD_THREAD_MESSAGES",
        threadId: "__placeholder__",
        messages: [message],
        skipIfStreaming: false,
      });
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.interactable.interactableComponents).toHaveLength(0);
  });
});
