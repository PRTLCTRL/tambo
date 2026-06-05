import { act, renderHook } from "@testing-library/react";
import React from "react";
import { z } from "zod/v3";
import { TamboProvider } from "../providers/tambo-v1-provider";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import { useStreamState, useStreamDispatch } from "../providers/tambo-v1-stream-context";
import type { TamboThreadMessage } from "../types/message";

// Mock component for testing
const TestCard: React.FC<{ title: string }> = ({ title }) => (
  <div>{title}</div>
);

const testCardSchema = z.object({ title: z.string() });

describe("Auto Interactables Feature", () => {
  it("does not automatically add components when flag is disabled (default)", () => {
    const { result } = renderHook(
      () => ({
        interactables: useTamboInteractable(),
        dispatch: useStreamDispatch(),
        streamState: useStreamState(),
      }),
      {
        wrapper: ({ children }) => (
          <TamboProvider
            apiKey="test-key"
            components={[
              {
                name: "TestCard",
                description: "A test card",
                component: TestCard,
                propsSchema: testCardSchema,
              },
            ]}
          >
            {children}
          </TamboProvider>
        ),
      },
    );

    // Dispatch a component event to simulate receiving a component from the AI
    act(() => {
      const message: TamboThreadMessage = {
        id: "msg-1",
        role: "assistant",
        content: [
          {
            type: "component",
            id: "comp-1",
            name: "TestCard",
            props: { title: "Test" },
            streamingState: "complete",
          },
        ],
      };

      result.current.dispatch({
        type: "ADD_MESSAGE",
        threadId: result.current.streamState.currentThreadId,
        message,
      });
    });

    // Component should NOT be in interactables
    expect(result.current.interactables.interactableComponents.length).toBe(0);
  });

  it("automatically adds components when flag is enabled", () => {
    const { result } = renderHook(
      () => ({
        interactables: useTamboInteractable(),
        dispatch: useStreamDispatch(),
        streamState: useStreamState(),
      }),
      {
        wrapper: ({ children }) => (
          <TamboProvider
            apiKey="test-key"
            autoAddComponentsToInteractables={true}
            components={[
              {
                name: "TestCard",
                description: "A test card",
                component: TestCard,
                propsSchema: testCardSchema,
              },
            ]}
          >
            {children}
          </TamboProvider>
        ),
      },
    );

    // Dispatch a component event to simulate receiving a component from the AI
    act(() => {
      const message: TamboThreadMessage = {
        id: "msg-1",
        role: "assistant",
        content: [
          {
            type: "component",
            id: "comp-1",
            name: "TestCard",
            props: { title: "Auto Test" },
            streamingState: "complete",
          },
        ],
      };

      result.current.dispatch({
        type: "ADD_MESSAGE",
        threadId: result.current.streamState.currentThreadId,
        message,
      });
    });

    // Component should be in interactables
    expect(result.current.interactables.interactableComponents.length).toBe(1);
    expect(result.current.interactables.interactableComponents[0].name).toBe(
      "TestCard",
    );
    expect(result.current.interactables.interactableComponents[0].props).toEqual(
      { title: "Auto Test" },
    );
  });

  it("does not duplicate components that are already interactable", () => {
    const { result } = renderHook(
      () => ({
        interactables: useTamboInteractable(),
        dispatch: useStreamDispatch(),
        streamState: useStreamState(),
      }),
      {
        wrapper: ({ children }) => (
          <TamboProvider
            apiKey="test-key"
            autoAddComponentsToInteractables={true}
            components={[
              {
                name: "TestCard",
                description: "A test card",
                component: TestCard,
                propsSchema: testCardSchema,
              },
            ]}
          >
            {children}
          </TamboProvider>
        ),
      },
    );

    // Add a message with a component
    act(() => {
      const message: TamboThreadMessage = {
        id: "msg-1",
        role: "assistant",
        content: [
          {
            type: "component",
            id: "comp-1",
            name: "TestCard",
            props: { title: "First" },
            streamingState: "complete",
          },
        ],
      };

      result.current.dispatch({
        type: "ADD_MESSAGE",
        threadId: result.current.streamState.currentThreadId,
        message,
      });
    });

    // Should have 1 interactable
    expect(result.current.interactables.interactableComponents.length).toBe(1);

    // Add the same component again (same content ID)
    act(() => {
      const message: TamboThreadMessage = {
        id: "msg-2",
        role: "assistant",
        content: [
          {
            type: "component",
            id: "comp-1", // Same ID
            name: "TestCard",
            props: { title: "Second" },
            streamingState: "complete",
          },
        ],
      };

      result.current.dispatch({
        type: "ADD_MESSAGE",
        threadId: result.current.streamState.currentThreadId,
        message,
      });
    });

    // Should still have only 1 interactable (no duplicate)
    expect(result.current.interactables.interactableComponents.length).toBe(1);
  });

  it("adds multiple different components", () => {
    const TestList: React.FC<{ items: string[] }> = ({ items }) => (
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );

    const testListSchema = z.object({ items: z.array(z.string()) });

    const { result } = renderHook(
      () => ({
        interactables: useTamboInteractable(),
        dispatch: useStreamDispatch(),
        streamState: useStreamState(),
      }),
      {
        wrapper: ({ children }) => (
          <TamboProvider
            apiKey="test-key"
            autoAddComponentsToInteractables={true}
            components={[
              {
                name: "TestCard",
                description: "A test card",
                component: TestCard,
                propsSchema: testCardSchema,
              },
              {
                name: "TestList",
                description: "A test list",
                component: TestList,
                propsSchema: testListSchema,
              },
            ]}
          >
            {children}
          </TamboProvider>
        ),
      },
    );

    // Add a message with multiple components
    act(() => {
      const message: TamboThreadMessage = {
        id: "msg-1",
        role: "assistant",
        content: [
          {
            type: "component",
            id: "comp-1",
            name: "TestCard",
            props: { title: "Card 1" },
            streamingState: "complete",
          },
          {
            type: "component",
            id: "comp-2",
            name: "TestList",
            props: { items: ["a", "b", "c"] },
            streamingState: "complete",
          },
        ],
      };

      result.current.dispatch({
        type: "ADD_MESSAGE",
        threadId: result.current.streamState.currentThreadId,
        message,
      });
    });

    // Should have 2 interactables
    expect(result.current.interactables.interactableComponents.length).toBe(2);
    const names = result.current.interactables.interactableComponents.map(
      (c) => c.name,
    );
    expect(names).toContain("TestCard");
    expect(names).toContain("TestList");
  });

  it("only processes assistant messages, not user messages", () => {
    const { result } = renderHook(
      () => ({
        interactables: useTamboInteractable(),
        dispatch: useStreamDispatch(),
        streamState: useStreamState(),
      }),
      {
        wrapper: ({ children }) => (
          <TamboProvider
            apiKey="test-key"
            autoAddComponentsToInteractables={true}
            components={[
              {
                name: "TestCard",
                description: "A test card",
                component: TestCard,
                propsSchema: testCardSchema,
              },
            ]}
          >
            {children}
          </TamboProvider>
        ),
      },
    );

    // Add a user message with a component (should not happen in practice, but test it)
    act(() => {
      const message: TamboThreadMessage = {
        id: "msg-1",
        role: "user",
        content: [
          {
            type: "component",
            id: "comp-1",
            name: "TestCard",
            props: { title: "User Component" },
            streamingState: "complete",
          },
        ],
      };

      result.current.dispatch({
        type: "ADD_MESSAGE",
        threadId: result.current.streamState.currentThreadId,
        message,
      });
    });

    // Component should NOT be added (user messages are ignored)
    expect(result.current.interactables.interactableComponents.length).toBe(0);
  });
});
