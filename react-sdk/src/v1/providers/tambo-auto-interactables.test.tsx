import TamboAI from "@tambo-ai/typescript-sdk";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { z } from "zod";
import { TamboProvider } from "./tambo-v1-provider";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import {
  useTamboClient,
  useTamboQueryClient,
} from "../../providers/tambo-client-provider";
import {
  useStreamState,
  useStreamDispatch,
} from "./tambo-v1-stream-context";
import type { TamboComponentContent } from "../types/message";
import { EventType, type CustomEvent } from "@tambo-ai/client";

// Module-level QueryClient for tests - created lazily
let testQueryClient: QueryClient | null = null;

// Mock the client provider
jest.mock("../../providers/tambo-client-provider", () => {
  return {
    useTamboClient: jest.fn(),
    useTamboQueryClient: jest.fn(),
    TamboClientProvider: jest.fn(
      ({ children }: { children: React.ReactNode }) => children,
    ),
  };
});

// Mock MCP providers
jest.mock("../../providers/tambo-mcp-token-provider", () => ({
  TamboMcpTokenProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

jest.mock("../../mcp/tambo-mcp-provider", () => ({
  TamboMcpProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock auth state
jest.mock("../hooks/use-tambo-v1-auth-state", () => ({
  useTamboAuthState: () => ({
    status: "identified",
    source: "userKey",
  }),
}));

// Mock useTamboSendMessage
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

// Test component
const TestComponent: React.FC<{ message: string }> = ({ message }) => {
  return <div>{message}</div>;
};

describe("TamboAutoInteractablesManager", () => {
  const mockFetch: typeof fetch = async (..._args) => {
    throw new Error("fetch not implemented");
  };

  const mockClient = new TamboAI({
    apiKey: "test-api-key",
    fetch: mockFetch,
  });

  const testComponent = {
    name: "TestComponent",
    description: "A test component",
    component: TestComponent,
    propsSchema: z.object({
      message: z.string(),
    }),
  };

  beforeEach(() => {
    // Create a fresh QueryClient for each test
    testQueryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    jest.mocked(useTamboClient).mockReturnValue(mockClient);
    jest.mocked(useTamboQueryClient).mockReturnValue(testQueryClient);

    // Mock TamboClientProvider to wrap children with QueryClientProvider
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

  it("does not register components when autoInteractables is disabled", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TamboProvider apiKey="test-api-key" components={[testComponent]}>
        {children}
      </TamboProvider>
    );

    const { result: streamResult } = renderHook(
      () => ({
        dispatch: useStreamDispatch(),
        state: useStreamState(),
      }),
      { wrapper },
    );

    const { result: interactableResult } = renderHook(
      () => useTamboInteractable(),
      { wrapper },
    );

    // Simulate a component.start event
    const componentStartEvent: CustomEvent = {
      type: EventType.CUSTOM,
      name: "tambo.component.start",
      value: {
        messageId: "msg_1",
        componentId: "comp_1",
        componentName: "TestComponent",
      },
    };

    streamResult.current.dispatch({
      type: "EVENT",
      event: componentStartEvent,
      threadId: streamResult.current.state.currentThreadId,
    });

    // Wait for the update to be processed
    await waitFor(() => {
      const messages =
        streamResult.current.state.threadMap[
          streamResult.current.state.currentThreadId
        ].thread.messages;
      expect(messages.length).toBeGreaterThan(0);
    });

    // Interactables should still be empty
    expect(interactableResult.current.interactableComponents).toHaveLength(0);
  });

  it("automatically registers components when autoInteractables is enabled", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TamboProvider
        apiKey="test-api-key"
        components={[testComponent]}
        autoInteractables={true}
      >
        {children}
      </TamboProvider>
    );

    const { result: streamResult } = renderHook(
      () => ({
        dispatch: useStreamDispatch(),
        state: useStreamState(),
      }),
      { wrapper },
    );

    const { result: interactableResult } = renderHook(
      () => useTamboInteractable(),
      { wrapper },
    );

    // Simulate a component.start event
    const componentStartEvent: CustomEvent = {
      type: EventType.CUSTOM,
      name: "tambo.component.start",
      value: {
        messageId: "msg_1",
        componentId: "comp_1",
        componentName: "TestComponent",
      },
    };

    streamResult.current.dispatch({
      type: "EVENT",
      event: componentStartEvent,
      threadId: streamResult.current.state.currentThreadId,
    });

    // Add props to the component
    const componentPropsEvent: CustomEvent = {
      type: EventType.CUSTOM,
      name: "tambo.component.props_delta",
      value: {
        componentId: "comp_1",
        operations: [
          { op: "add", path: "/message", value: "Hello World" },
        ],
      },
    };

    streamResult.current.dispatch({
      type: "EVENT",
      event: componentPropsEvent,
      threadId: streamResult.current.state.currentThreadId,
    });

    // Wait for the component to be added to interactables
    await waitFor(() => {
      expect(interactableResult.current.interactableComponents.length).toBeGreaterThan(0);
    });

    // Verify the component was registered
    const registered = interactableResult.current.interactableComponents[0];
    expect(registered.name).toBe("TestComponent");
    expect(registered.props).toEqual({ message: "Hello World" });
  });

  it("does not register the same component twice", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TamboProvider
        apiKey="test-api-key"
        components={[testComponent]}
        autoInteractables={true}
      >
        {children}
      </TamboProvider>
    );

    const { result: streamResult } = renderHook(
      () => ({
        dispatch: useStreamDispatch(),
        state: useStreamState(),
      }),
      { wrapper },
    );

    const { result: interactableResult } = renderHook(
      () => useTamboInteractable(),
      { wrapper },
    );

    // Simulate a component.start event
    const componentStartEvent: CustomEvent = {
      type: EventType.CUSTOM,
      name: "tambo.component.start",
      value: {
        messageId: "msg_1",
        componentId: "comp_1",
        componentName: "TestComponent",
      },
    };

    streamResult.current.dispatch({
      type: "EVENT",
      event: componentStartEvent,
      threadId: streamResult.current.state.currentThreadId,
    });

    // Add props
    const componentPropsEvent: CustomEvent = {
      type: EventType.CUSTOM,
      name: "tambo.component.props_delta",
      value: {
        componentId: "comp_1",
        operations: [
          { op: "add", path: "/message", value: "Hello World" },
        ],
      },
    };

    streamResult.current.dispatch({
      type: "EVENT",
      event: componentPropsEvent,
      threadId: streamResult.current.state.currentThreadId,
    });

    // Wait for registration
    await waitFor(() => {
      expect(interactableResult.current.interactableComponents.length).toBe(1);
    });

    const firstCount = interactableResult.current.interactableComponents.length;

    // Update the component props (simulating a re-render)
    const updatePropsEvent: CustomEvent = {
      type: EventType.CUSTOM,
      name: "tambo.component.props_delta",
      value: {
        componentId: "comp_1",
        operations: [
          { op: "replace", path: "/message", value: "Updated Message" },
        ],
      },
    };

    streamResult.current.dispatch({
      type: "EVENT",
      event: updatePropsEvent,
      threadId: streamResult.current.state.currentThreadId,
    });

    // Wait a bit to ensure no duplicate registration
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should still have the same number of interactables
    expect(interactableResult.current.interactableComponents).toHaveLength(
      firstCount,
    );
  });
});
