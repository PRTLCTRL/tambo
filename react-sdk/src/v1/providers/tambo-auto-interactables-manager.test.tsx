import TamboAI from "@tambo-ai/typescript-sdk";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import { z } from "zod/v3";
import { TamboProvider } from "./tambo-v1-provider";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import { useTambo } from "../hooks/use-tambo-v1";
import {
  useTamboClient,
  useTamboQueryClient,
} from "../../providers/tambo-client-provider";

const TestComponent = (props: { message: string }) => <div>{props.message}</div>;

let testQueryClient: QueryClient | null = null;

jest.mock("../../providers/tambo-client-provider", () => {
  return {
    useTamboClient: jest.fn(),
    useTamboQueryClient: jest.fn(),
    TamboClientProvider: jest.fn(
      ({ children }: { children: React.ReactNode }) => children,
    ),
  };
});

jest.mock("../../providers/tambo-mcp-token-provider", () => ({
  TamboMcpTokenProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

jest.mock("../../mcp/tambo-mcp-provider", () => ({
  TamboMcpProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("../hooks/use-tambo-v1-auth-state", () => ({
  useTamboAuthState: () => ({
    status: "identified",
    source: "userKey",
  }),
}));

jest.mock("../hooks/use-tambo-v1-send-message", () => ({
  useTamboSendMessage: jest.fn(() => ({
    mutateAsync: jest.fn(),
    mutate: jest.fn(),
    isPending: false,
    isError: false,
    error: null,
    isSuccess: false,
    reset: jest.fn(),
  })),
}));

describe("AutoInteractablesManager", () => {
  const mockFetch: typeof fetch = async (..._args) => {
    throw new Error("fetch not implemented");
  };

  const mockClient = new TamboAI({
    apiKey: "test-api-key",
    fetch: mockFetch,
  });

  beforeEach(() => {
    testQueryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    jest.mocked(useTamboClient).mockReturnValue(mockClient);
    jest.mocked(useTamboQueryClient).mockReturnValue(testQueryClient);

    const { TamboClientProvider } = jest.requireMock(
      "../../providers/tambo-client-provider",
    );
    jest
      .mocked(TamboClientProvider)
      .mockImplementation(({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={testQueryClient!}>
          {children}
        </QueryClientProvider>
      ));
  });

  it("does not add components when autoAddToInteractables is false", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TamboProvider
        apiKey="test-api-key"
        components={[
          {
            name: "TestComponent",
            description: "A test component",
            component: TestComponent,
            props: z.object({ message: z.string() }),
          },
        ]}
        autoAddToInteractables={false}
      >
        {children}
      </TamboProvider>
    );

    const { result: tamboResult } = renderHook(() => useTambo(), { wrapper });
    const { result: interactablesResult } = renderHook(
      () => useTamboInteractable(),
      { wrapper },
    );

    act(() => {
      tamboResult.current.dispatch({
        type: "LOAD_THREAD_MESSAGES",
        threadId: tamboResult.current.currentThreadId,
        messages: [
          {
            id: "msg-1",
            role: "assistant",
            content: [
              {
                type: "component",
                id: "comp-1",
                name: "TestComponent",
                props: { message: "Hello" },
                streamingState: "done",
              },
            ],
          },
        ],
      });
    });

    await waitFor(() => {
      expect(interactablesResult.current.interactableComponents).toHaveLength(0);
    });
  });

  it("adds completed components to interactables when autoAddToInteractables is enabled", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TamboProvider
        apiKey="test-api-key"
        components={[
          {
            name: "TestComponent",
            description: "A test component",
            component: TestComponent,
            props: z.object({ message: z.string() }),
          },
        ]}
        autoAddToInteractables={true}
      >
        {children}
      </TamboProvider>
    );

    const { result: tamboResult } = renderHook(() => useTambo(), { wrapper });
    const { result: interactablesResult } = renderHook(
      () => useTamboInteractable(),
      { wrapper },
    );

    act(() => {
      tamboResult.current.dispatch({
        type: "LOAD_THREAD_MESSAGES",
        threadId: tamboResult.current.currentThreadId,
        messages: [
          {
            id: "msg-1",
            role: "assistant",
            content: [
              {
                type: "component",
                id: "comp-1",
                name: "TestComponent",
                props: { message: "Hello" },
                streamingState: "done",
              },
            ],
          },
        ],
      });
    });

    await waitFor(() => {
      expect(interactablesResult.current.interactableComponents).toHaveLength(1);
      expect(interactablesResult.current.interactableComponents[0].name).toBe(
        "TestComponent",
      );
      expect(interactablesResult.current.interactableComponents[0].props).toEqual({
        message: "Hello",
      });
    });
  });

  it("does not add streaming components until they are done", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TamboProvider
        apiKey="test-api-key"
        components={[
          {
            name: "TestComponent",
            description: "A test component",
            component: TestComponent,
            props: z.object({ message: z.string() }),
          },
        ]}
        autoAddToInteractables={true}
      >
        {children}
      </TamboProvider>
    );

    const { result: tamboResult } = renderHook(() => useTambo(), { wrapper });
    const { result: interactablesResult } = renderHook(
      () => useTamboInteractable(),
      { wrapper },
    );

    act(() => {
      tamboResult.current.dispatch({
        type: "LOAD_THREAD_MESSAGES",
        threadId: tamboResult.current.currentThreadId,
        messages: [
          {
            id: "msg-1",
            role: "assistant",
            content: [
              {
                type: "component",
                id: "comp-1",
                name: "TestComponent",
                props: { message: "Hello" },
                streamingState: "streaming",
              },
            ],
          },
        ],
      });
    });

    await waitFor(() => {
      expect(interactablesResult.current.interactableComponents).toHaveLength(0);
    });
  });

  it("adds multiple components from the same message", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TamboProvider
        apiKey="test-api-key"
        components={[
          {
            name: "TestComponent",
            description: "A test component",
            component: TestComponent,
            props: z.object({ message: z.string() }),
          },
        ]}
        autoAddToInteractables={true}
      >
        {children}
      </TamboProvider>
    );

    const { result: tamboResult } = renderHook(() => useTambo(), { wrapper });
    const { result: interactablesResult } = renderHook(
      () => useTamboInteractable(),
      { wrapper },
    );

    act(() => {
      tamboResult.current.dispatch({
        type: "LOAD_THREAD_MESSAGES",
        threadId: tamboResult.current.currentThreadId,
        messages: [
          {
            id: "msg-1",
            role: "assistant",
            content: [
              {
                type: "component",
                id: "comp-1",
                name: "TestComponent",
                props: { message: "Hello" },
                streamingState: "done",
              },
              {
                type: "component",
                id: "comp-2",
                name: "TestComponent",
                props: { message: "World" },
                streamingState: "done",
              },
            ],
          },
        ],
      });
    });

    await waitFor(() => {
      expect(interactablesResult.current.interactableComponents).toHaveLength(2);
      expect(interactablesResult.current.interactableComponents[0].props).toEqual({
        message: "Hello",
      });
      expect(interactablesResult.current.interactableComponents[1].props).toEqual({
        message: "World",
      });
    });
  });
});
