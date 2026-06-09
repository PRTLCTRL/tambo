import { act, renderHook } from "@testing-library/react";
import React from "react";
import { z } from "zod/v3";
import { TamboProvider } from "../providers/tambo-v1-provider";
import { useTambo } from "../hooks/use-tambo-v1";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import type { TamboComponent } from "../../model/component-metadata";
import { EventType } from "@ag-ui/core";

// Test component
const TestCard: React.FC<{ title: string; content: string }> = ({
  title,
  content,
}) => (
  <div>
    <h3>{title}</h3>
    <p>{content}</p>
  </div>
);

const testComponents: TamboComponent[] = [
  {
    name: "TestCard",
    description: "A test card component",
    component: TestCard,
    propsSchema: z.object({
      title: z.string(),
      content: z.string(),
    }),
  },
];

describe("Auto-add Components to Interactables", () => {
  it("does not add components to interactables when feature is disabled (default)", async () => {
    const { result } = renderHook(
      () => ({
        tambo: useTambo(),
        interactable: useTamboInteractable(),
      }),
      {
        wrapper: ({ children }) => (
          <TamboProvider
            apiKey="test-key"
            userKey="test-user"
            components={testComponents}
          >
            {children}
          </TamboProvider>
        ),
      },
    );

    // Simulate receiving a message with a component
    await act(async () => {
      result.current.tambo.dispatch({
        type: "EVENT",
        threadId: "placeholder",
        event: {
          type: EventType.MESSAGE_START,
          messageId: "msg1",
          role: "assistant",
          timestamp: Date.now(),
        },
      });

      result.current.tambo.dispatch({
        type: "EVENT",
        threadId: "placeholder",
        event: {
          type: EventType.COMPONENT_START,
          componentId: "comp1",
          componentName: "TestCard",
          timestamp: Date.now(),
        },
      });

      result.current.tambo.dispatch({
        type: "EVENT",
        threadId: "placeholder",
        event: {
          type: EventType.COMPONENT_DELTA,
          componentId: "comp1",
          delta: { title: "Test", content: "Content" },
          timestamp: Date.now(),
        },
      });

      result.current.tambo.dispatch({
        type: "EVENT",
        threadId: "placeholder",
        event: {
          type: EventType.COMPONENT_COMPLETE,
          componentId: "comp1",
          timestamp: Date.now(),
        },
      });
    });

    // Component should NOT be in interactables
    expect(result.current.interactable.interactableComponents).toHaveLength(0);
  });

  it("adds components to interactables when feature is enabled", async () => {
    const { result } = renderHook(
      () => ({
        tambo: useTambo(),
        interactable: useTamboInteractable(),
      }),
      {
        wrapper: ({ children }) => (
          <TamboProvider
            apiKey="test-key"
            userKey="test-user"
            components={testComponents}
            autoAddComponentsToInteractables={true}
          >
            {children}
          </TamboProvider>
        ),
      },
    );

    // Simulate receiving a message with a component
    await act(async () => {
      result.current.tambo.dispatch({
        type: "EVENT",
        threadId: "placeholder",
        event: {
          type: EventType.MESSAGE_START,
          messageId: "msg1",
          role: "assistant",
          timestamp: Date.now(),
        },
      });

      result.current.tambo.dispatch({
        type: "EVENT",
        threadId: "placeholder",
        event: {
          type: EventType.COMPONENT_START,
          componentId: "comp1",
          componentName: "TestCard",
          timestamp: Date.now(),
        },
      });

      result.current.tambo.dispatch({
        type: "EVENT",
        threadId: "placeholder",
        event: {
          type: EventType.COMPONENT_DELTA,
          componentId: "comp1",
          delta: { title: "Test", content: "Content" },
          timestamp: Date.now(),
        },
      });

      result.current.tambo.dispatch({
        type: "EVENT",
        threadId: "placeholder",
        event: {
          type: EventType.COMPONENT_COMPLETE,
          componentId: "comp1",
          timestamp: Date.now(),
        },
      });
    });

    // Component should be in interactables
    expect(result.current.interactable.interactableComponents).toHaveLength(1);
    expect(result.current.interactable.interactableComponents[0]).toMatchObject(
      {
        name: "TestCard",
        props: { title: "Test", content: "Content" },
      },
    );
  });

  it("does not add the same component twice", async () => {
    const { result } = renderHook(
      () => ({
        tambo: useTambo(),
        interactable: useTamboInteractable(),
      }),
      {
        wrapper: ({ children }) => (
          <TamboProvider
            apiKey="test-key"
            userKey="test-user"
            components={testComponents}
            autoAddComponentsToInteractables={true}
          >
            {children}
          </TamboProvider>
        ),
      },
    );

    // Simulate receiving a message with a component
    await act(async () => {
      result.current.tambo.dispatch({
        type: "EVENT",
        threadId: "placeholder",
        event: {
          type: EventType.MESSAGE_START,
          messageId: "msg1",
          role: "assistant",
          timestamp: Date.now(),
        },
      });

      result.current.tambo.dispatch({
        type: "EVENT",
        threadId: "placeholder",
        event: {
          type: EventType.COMPONENT_START,
          componentId: "comp1",
          componentName: "TestCard",
          timestamp: Date.now(),
        },
      });

      result.current.tambo.dispatch({
        type: "EVENT",
        threadId: "placeholder",
        event: {
          type: EventType.COMPONENT_DELTA,
          componentId: "comp1",
          delta: { title: "Test", content: "Content" },
          timestamp: Date.now(),
        },
      });

      result.current.tambo.dispatch({
        type: "EVENT",
        threadId: "placeholder",
        event: {
          type: EventType.COMPONENT_COMPLETE,
          componentId: "comp1",
          timestamp: Date.now(),
        },
      });
    });

    // Component should be added once
    expect(result.current.interactable.interactableComponents).toHaveLength(1);

    // Force a re-render by accessing messages (which processes components again)
    await act(async () => {
      result.current.tambo.messages;
    });

    // Should still only be one component in interactables
    expect(result.current.interactable.interactableComponents).toHaveLength(1);
  });

  it("adds multiple different components to interactables", async () => {
    const { result } = renderHook(
      () => ({
        tambo: useTambo(),
        interactable: useTamboInteractable(),
      }),
      {
        wrapper: ({ children }) => (
          <TamboProvider
            apiKey="test-key"
            userKey="test-user"
            components={testComponents}
            autoAddComponentsToInteractables={true}
          >
            {children}
          </TamboProvider>
        ),
      },
    );

    // Simulate receiving multiple components
    await act(async () => {
      // First component
      result.current.tambo.dispatch({
        type: "EVENT",
        threadId: "placeholder",
        event: {
          type: EventType.MESSAGE_START,
          messageId: "msg1",
          role: "assistant",
          timestamp: Date.now(),
        },
      });

      result.current.tambo.dispatch({
        type: "EVENT",
        threadId: "placeholder",
        event: {
          type: EventType.COMPONENT_START,
          componentId: "comp1",
          componentName: "TestCard",
          timestamp: Date.now(),
        },
      });

      result.current.tambo.dispatch({
        type: "EVENT",
        threadId: "placeholder",
        event: {
          type: EventType.COMPONENT_DELTA,
          componentId: "comp1",
          delta: { title: "First", content: "Content 1" },
          timestamp: Date.now(),
        },
      });

      result.current.tambo.dispatch({
        type: "EVENT",
        threadId: "placeholder",
        event: {
          type: EventType.COMPONENT_COMPLETE,
          componentId: "comp1",
          timestamp: Date.now(),
        },
      });

      // Second component
      result.current.tambo.dispatch({
        type: "EVENT",
        threadId: "placeholder",
        event: {
          type: EventType.COMPONENT_START,
          componentId: "comp2",
          componentName: "TestCard",
          timestamp: Date.now(),
        },
      });

      result.current.tambo.dispatch({
        type: "EVENT",
        threadId: "placeholder",
        event: {
          type: EventType.COMPONENT_DELTA,
          componentId: "comp2",
          delta: { title: "Second", content: "Content 2" },
          timestamp: Date.now(),
        },
      });

      result.current.tambo.dispatch({
        type: "EVENT",
        threadId: "placeholder",
        event: {
          type: EventType.COMPONENT_COMPLETE,
          componentId: "comp2",
          timestamp: Date.now(),
        },
      });
    });

    // Both components should be in interactables
    expect(result.current.interactable.interactableComponents).toHaveLength(2);
    expect(result.current.interactable.interactableComponents[0].props).toEqual(
      { title: "First", content: "Content 1" },
    );
    expect(result.current.interactable.interactableComponents[1].props).toEqual(
      { title: "Second", content: "Content 2" },
    );
  });

  it("does not add components that are still streaming", async () => {
    const { result } = renderHook(
      () => ({
        tambo: useTambo(),
        interactable: useTamboInteractable(),
      }),
      {
        wrapper: ({ children }) => (
          <TamboProvider
            apiKey="test-key"
            userKey="test-user"
            components={testComponents}
            autoAddComponentsToInteractables={true}
          >
            {children}
          </TamboProvider>
        ),
      },
    );

    // Simulate receiving a component but don't complete it
    await act(async () => {
      result.current.tambo.dispatch({
        type: "EVENT",
        threadId: "placeholder",
        event: {
          type: EventType.MESSAGE_START,
          messageId: "msg1",
          role: "assistant",
          timestamp: Date.now(),
        },
      });

      result.current.tambo.dispatch({
        type: "EVENT",
        threadId: "placeholder",
        event: {
          type: EventType.COMPONENT_START,
          componentId: "comp1",
          componentName: "TestCard",
          timestamp: Date.now(),
        },
      });

      result.current.tambo.dispatch({
        type: "EVENT",
        threadId: "placeholder",
        event: {
          type: EventType.COMPONENT_DELTA,
          componentId: "comp1",
          delta: { title: "Test" },
          timestamp: Date.now(),
        },
      });
    });

    // Component should NOT be in interactables yet
    expect(result.current.interactable.interactableComponents).toHaveLength(0);

    // Complete the component
    await act(async () => {
      result.current.tambo.dispatch({
        type: "EVENT",
        threadId: "placeholder",
        event: {
          type: EventType.COMPONENT_DELTA,
          componentId: "comp1",
          delta: { content: "Content" },
          timestamp: Date.now(),
        },
      });

      result.current.tambo.dispatch({
        type: "EVENT",
        threadId: "placeholder",
        event: {
          type: EventType.COMPONENT_COMPLETE,
          componentId: "comp1",
          timestamp: Date.now(),
        },
      });
    });

    // Now it should be in interactables
    expect(result.current.interactable.interactableComponents).toHaveLength(1);
  });
});
