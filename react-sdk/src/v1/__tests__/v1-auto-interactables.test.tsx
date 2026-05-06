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
import { TamboProvider } from "../providers/tambo-v1-provider";
import { TamboClientProvider } from "../../providers/tambo-client-provider";
import type { TamboThreadMessage } from "@tambo-ai/client";
import { useStreamDispatch, useStreamState } from "../providers/tambo-v1-stream-context";

const TestWidget: React.FC<{ label: string }> = ({ label }) => (
  <div>{label}</div>
);

const TestCard: React.FC<{ title: string; content: string }> = ({
  title,
  content,
}) => (
  <div>
    <h1>{title}</h1>
    <p>{content}</p>
  </div>
);

function createMockRegistry() {
  const toolRegistry: Record<string, unknown> = {};
  return {
    value: {
      componentList: {
        TestWidget: {
          name: "TestWidget",
          description: "A test widget",
          component: TestWidget,
          props: z.object({ label: z.string() }),
        },
        TestCard: {
          name: "TestCard",
          description: "A test card",
          component: TestCard,
          props: z.object({
            title: z.string(),
            content: z.string(),
          }),
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
  autoAddComponentsToInteractables = false,
}: {
  children: React.ReactNode;
  autoAddComponentsToInteractables?: boolean;
}) {
  return (
    <TamboClientProvider apiKey="test-key">
      <TamboProvider
        apiKey="test-key"
        autoAddComponentsToInteractables={autoAddComponentsToInteractables}
        components={[
          {
            name: "TestWidget",
            description: "A test widget",
            component: TestWidget,
            propsSchema: z.object({ label: z.string() }),
          },
          {
            name: "TestCard",
            description: "A test card",
            component: TestCard,
            propsSchema: z.object({
              title: z.string(),
              content: z.string(),
            }),
          },
        ]}
      >
        {children}
      </TamboProvider>
    </TamboClientProvider>
  );
}

describe("Auto Interactables", () => {
  it("should not add components when autoAddComponentsToInteractables is false", () => {
    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        dispatch: useStreamDispatch(),
      }),
      {
        wrapper: ({ children }) => (
          <TestWrapper autoAddComponentsToInteractables={false}>
            {children}
          </TestWrapper>
        ),
      },
    );

    act(() => {
      result.current.dispatch({
        type: "APPEND_MESSAGE",
        threadId: "__placeholder__",
        message: {
          id: "msg_1",
          role: "assistant",
          content: [
            {
              type: "component",
              id: "comp_1",
              name: "TestWidget",
              props: { label: "Hello" },
              streamingState: "complete",
            },
          ],
        } as TamboThreadMessage,
      });
    });

    expect(result.current.interactable.interactableComponents).toHaveLength(0);
  });

  it("should automatically add components when autoAddComponentsToInteractables is true", async () => {
    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        dispatch: useStreamDispatch(),
        state: useStreamState(),
      }),
      {
        wrapper: ({ children }) => (
          <TestWrapper autoAddComponentsToInteractables={true}>
            {children}
          </TestWrapper>
        ),
      },
    );

    act(() => {
      result.current.dispatch({
        type: "APPEND_MESSAGE",
        threadId: "__placeholder__",
        message: {
          id: "msg_1",
          role: "assistant",
          content: [
            {
              type: "component",
              id: "comp_1",
              name: "TestWidget",
              props: { label: "Hello" },
              streamingState: "complete",
            },
          ],
        } as TamboThreadMessage,
      });
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.interactable.interactableComponents.length).toBeGreaterThan(0);
    const addedComponent = result.current.interactable.interactableComponents.find(
      (c) => c.name === "TestWidget",
    );
    expect(addedComponent).toBeDefined();
    expect(addedComponent?.props).toEqual({ label: "Hello" });
  });

  it("should add multiple components from the same message", async () => {
    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        dispatch: useStreamDispatch(),
      }),
      {
        wrapper: ({ children }) => (
          <TestWrapper autoAddComponentsToInteractables={true}>
            {children}
          </TestWrapper>
        ),
      },
    );

    act(() => {
      result.current.dispatch({
        type: "APPEND_MESSAGE",
        threadId: "__placeholder__",
        message: {
          id: "msg_1",
          role: "assistant",
          content: [
            {
              type: "component",
              id: "comp_1",
              name: "TestWidget",
              props: { label: "Widget 1" },
              streamingState: "complete",
            },
            {
              type: "text",
              text: "Some text between components",
            },
            {
              type: "component",
              id: "comp_2",
              name: "TestCard",
              props: { title: "Card Title", content: "Card content" },
              streamingState: "complete",
            },
          ],
        } as TamboThreadMessage,
      });
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.interactable.interactableComponents.length).toBeGreaterThanOrEqual(2);
    const widget = result.current.interactable.interactableComponents.find(
      (c) => c.name === "TestWidget",
    );
    const card = result.current.interactable.interactableComponents.find(
      (c) => c.name === "TestCard",
    );

    expect(widget).toBeDefined();
    expect(card).toBeDefined();
  });

  it("should not add the same component twice", async () => {
    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        dispatch: useStreamDispatch(),
      }),
      {
        wrapper: ({ children }) => (
          <TestWrapper autoAddComponentsToInteractables={true}>
            {children}
          </TestWrapper>
        ),
      },
    );

    act(() => {
      result.current.dispatch({
        type: "APPEND_MESSAGE",
        threadId: "__placeholder__",
        message: {
          id: "msg_1",
          role: "assistant",
          content: [
            {
              type: "component",
              id: "comp_1",
              name: "TestWidget",
              props: { label: "Hello" },
              streamingState: "complete",
            },
          ],
        } as TamboThreadMessage,
      });
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const countAfterFirst = result.current.interactable.interactableComponents.length;

    act(() => {
      result.current.dispatch({
        type: "LOAD_THREAD_MESSAGES",
        threadId: "__placeholder__",
        messages: [
          {
            id: "msg_1",
            role: "assistant",
            content: [
              {
                type: "component",
                id: "comp_1",
                name: "TestWidget",
                props: { label: "Hello" },
                streamingState: "complete",
              },
            ],
          } as TamboThreadMessage,
        ],
      });
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.interactable.interactableComponents.length).toBe(countAfterFirst);
  });

  it("should only process assistant messages, not user messages", async () => {
    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        dispatch: useStreamDispatch(),
      }),
      {
        wrapper: ({ children }) => (
          <TestWrapper autoAddComponentsToInteractables={true}>
            {children}
          </TestWrapper>
        ),
      },
    );

    act(() => {
      result.current.dispatch({
        type: "APPEND_MESSAGE",
        threadId: "__placeholder__",
        message: {
          id: "msg_1",
          role: "user",
          content: [
            {
              type: "component",
              id: "comp_1",
              name: "TestWidget",
              props: { label: "Hello" },
              streamingState: "complete",
            },
          ],
        } as TamboThreadMessage,
      });
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.interactable.interactableComponents).toHaveLength(0);
  });
});
