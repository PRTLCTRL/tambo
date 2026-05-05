import { act, renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { z } from "zod";
import { TamboProvider } from "./tambo-v1-provider";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import { useStreamDispatch, useStreamState } from "./tambo-v1-stream-context";
import type { TamboComponentContent } from "../types/message";

// Mock the client
const mockClient = {
  threads: {
    messages: {
      list: jest.fn(),
    },
    retrieve: jest.fn(),
  },
};

jest.mock("../../providers/tambo-client-provider", () => ({
  TamboClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useTamboClient: () => mockClient,
}));

describe("AutoInteractableManager", () => {
  const TestComponent: React.FC<{ title: string }> = ({ title }) => (
    <div>{title}</div>
  );

  const testComponentConfig = {
    name: "TestComponent",
    description: "A test component",
    component: TestComponent,
    propsSchema: z.object({
      title: z.string(),
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.threads.messages.list.mockResolvedValue({ messages: [] });
    mockClient.threads.retrieve.mockResolvedValue({
      id: "thread_123",
      userKey: "user_123",
      lastCompletedRunId: null,
    });
  });

  it("should automatically register components when autoInteractComponents is enabled", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TamboProvider
        apiKey="test-key"
        userKey="user_123"
        components={[testComponentConfig]}
        autoInteractComponents={true}
      >
        {children}
      </TamboProvider>
    );

    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        dispatch: useStreamDispatch(),
        state: useStreamState(),
      }),
      { wrapper }
    );

    // Simulate receiving a component message
    act(() => {
      result.current.dispatch({
        type: "EVENT",
        event: {
          eventType: "message",
          threadId: "thread_123",
          message: {
            id: "msg_123",
            role: "assistant",
            content: [
              {
                type: "component",
                id: "comp_123",
                name: "TestComponent",
                props: { title: "Test Title" },
                streamingState: "complete",
              } as TamboComponentContent,
            ],
          },
        },
      });
    });

    // Wait for the auto-interactable manager to process
    await waitFor(
      () => {
        expect(result.current.interactable.interactableComponents.length).toBeGreaterThan(0);
      },
      { timeout: 1000 }
    );

    // Verify component was registered as interactable
    const interactables = result.current.interactable.interactableComponents;
    expect(interactables).toHaveLength(1);
    expect(interactables[0].name).toBe("TestComponent");
    expect(interactables[0].props).toEqual({ title: "Test Title" });
  });

  it("should not register components when autoInteractComponents is disabled", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TamboProvider
        apiKey="test-key"
        userKey="user_123"
        components={[testComponentConfig]}
        autoInteractComponents={false}
      >
        {children}
      </TamboProvider>
    );

    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        dispatch: useStreamDispatch(),
      }),
      { wrapper }
    );

    // Simulate receiving a component message
    act(() => {
      result.current.dispatch({
        type: "EVENT",
        event: {
          eventType: "message",
          threadId: "thread_123",
          message: {
            id: "msg_123",
            role: "assistant",
            content: [
              {
                type: "component",
                id: "comp_123",
                name: "TestComponent",
                props: { title: "Test Title" },
                streamingState: "complete",
              } as TamboComponentContent,
            ],
          },
        },
      });
    });

    // Wait a bit to ensure no registration happens
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify no components were registered
    expect(result.current.interactable.interactableComponents).toHaveLength(0);
  });

  it("should not register the same component twice", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TamboProvider
        apiKey="test-key"
        userKey="user_123"
        components={[testComponentConfig]}
        autoInteractComponents={true}
      >
        {children}
      </TamboProvider>
    );

    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        dispatch: useStreamDispatch(),
      }),
      { wrapper }
    );

    const componentContent = {
      type: "component",
      id: "comp_123",
      name: "TestComponent",
      props: { title: "Test Title" },
      streamingState: "complete",
    } as TamboComponentContent;

    // Simulate receiving the same component message twice
    act(() => {
      result.current.dispatch({
        type: "EVENT",
        event: {
          eventType: "message",
          threadId: "thread_123",
          message: {
            id: "msg_123",
            role: "assistant",
            content: [componentContent],
          },
        },
      });
    });

    await waitFor(
      () => {
        expect(result.current.interactable.interactableComponents.length).toBe(1);
      },
      { timeout: 1000 }
    );

    // Send the same message again
    act(() => {
      result.current.dispatch({
        type: "EVENT",
        event: {
          eventType: "message",
          threadId: "thread_123",
          message: {
            id: "msg_456",
            role: "assistant",
            content: [componentContent],
          },
        },
      });
    });

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should still only have one interactable
    expect(result.current.interactable.interactableComponents).toHaveLength(1);
  });

  it("should register multiple different components", async () => {
    const SecondComponent: React.FC<{ text: string }> = ({ text }) => <span>{text}</span>;

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TamboProvider
        apiKey="test-key"
        userKey="user_123"
        components={[
          testComponentConfig,
          {
            name: "SecondComponent",
            description: "Another test component",
            component: SecondComponent,
            propsSchema: z.object({ text: z.string() }),
          },
        ]}
        autoInteractComponents={true}
      >
        {children}
      </TamboProvider>
    );

    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        dispatch: useStreamDispatch(),
      }),
      { wrapper }
    );

    // Send message with multiple components
    act(() => {
      result.current.dispatch({
        type: "EVENT",
        event: {
          eventType: "message",
          threadId: "thread_123",
          message: {
            id: "msg_123",
            role: "assistant",
            content: [
              {
                type: "component",
                id: "comp_1",
                name: "TestComponent",
                props: { title: "First" },
                streamingState: "complete",
              } as TamboComponentContent,
              {
                type: "component",
                id: "comp_2",
                name: "SecondComponent",
                props: { text: "Second" },
                streamingState: "complete",
              } as TamboComponentContent,
            ],
          },
        },
      });
    });

    await waitFor(
      () => {
        expect(result.current.interactable.interactableComponents.length).toBe(2);
      },
      { timeout: 1000 }
    );

    const interactables = result.current.interactable.interactableComponents;
    expect(interactables[0].name).toBe("TestComponent");
    expect(interactables[1].name).toBe("SecondComponent");
  });
});
