import { act, renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { z } from "zod/v3";
import type { TamboComponent } from "../model/component-metadata";
import type { TamboThreadMessage } from "../v1/types/message";
import { TamboProvider } from "../v1/providers/tambo-v1-provider";
import { useTamboInteractable } from "./tambo-interactable-provider";
import { useStreamDispatch } from "../v1/providers/tambo-v1-stream-context";

// Test component
const TestComponent: React.FC<{ title: string; value: number }> = ({
  title,
  value,
}) => (
  <div>
    {title}: {value}
  </div>
);

const testComponents: TamboComponent[] = [
  {
    name: "TestComponent",
    description: "A test component",
    component: TestComponent,
    propsSchema: z.object({
      title: z.string(),
      value: z.number(),
    }),
  },
];

describe("TamboInteractableProvider - Auto Add", () => {
  it("should automatically add components to interactables when autoAddToInteractables is true", async () => {
    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        dispatch: useStreamDispatch(),
      }),
      {
        wrapper: ({ children }) => (
          <TamboProvider
            apiKey="test-key"
            userKey="test-user"
            components={testComponents}
            autoAddToInteractables={true}
          >
            {children}
          </TamboProvider>
        ),
      },
    );

    // Initially, no interactables
    expect(result.current.interactable.interactableComponents).toHaveLength(0);

    // Simulate a message with a component
    const testMessage: TamboThreadMessage = {
      id: "msg_1",
      role: "assistant",
      content: [
        {
          type: "component",
          id: "comp_1",
          name: "TestComponent",
          props: {
            title: "Test",
            value: 42,
          },
          streamingState: "complete",
        },
      ],
    };

    act(() => {
      result.current.dispatch({
        type: "LOAD_THREAD_MESSAGES",
        threadId: "__placeholder__",
        messages: [testMessage],
        skipIfStreaming: false,
      });
    });

    // Wait for the component to be added to interactables
    await waitFor(
      () => {
        expect(
          result.current.interactable.interactableComponents,
        ).toHaveLength(1);
      },
      { timeout: 3000 },
    );

    // Verify the component was added correctly
    const interactableComponent =
      result.current.interactable.interactableComponents[0];
    expect(interactableComponent.name).toBe("TestComponent");
    expect(interactableComponent.props).toEqual({
      title: "Test",
      value: 42,
    });
  });

  it("should NOT automatically add components when autoAddToInteractables is false", async () => {
    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        dispatch: useStreamDispatch(),
      }),
      {
        wrapper: ({ children }) => (
          <TamboProvider
            apiKey="test-key"
            userKey="test-user"
            components={testComponents}
            autoAddToInteractables={false}
          >
            {children}
          </TamboProvider>
        ),
      },
    );

    // Initially, no interactables
    expect(result.current.interactable.interactableComponents).toHaveLength(0);

    // Simulate a message with a component
    const testMessage: TamboThreadMessage = {
      id: "msg_1",
      role: "assistant",
      content: [
        {
          type: "component",
          id: "comp_1",
          name: "TestComponent",
          props: {
            title: "Test",
            value: 42,
          },
          streamingState: "complete",
        },
      ],
    };

    act(() => {
      result.current.dispatch({
        type: "LOAD_THREAD_MESSAGES",
        threadId: "__placeholder__",
        messages: [testMessage],
        skipIfStreaming: false,
      });
    });

    // Wait a bit to ensure nothing gets added
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should still be empty
    expect(result.current.interactable.interactableComponents).toHaveLength(0);
  });

  it("should NOT automatically add components when autoAddToInteractables is undefined (default)", async () => {
    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        dispatch: useStreamDispatch(),
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

    // Initially, no interactables
    expect(result.current.interactable.interactableComponents).toHaveLength(0);

    // Simulate a message with a component
    const testMessage: TamboThreadMessage = {
      id: "msg_1",
      role: "assistant",
      content: [
        {
          type: "component",
          id: "comp_1",
          name: "TestComponent",
          props: {
            title: "Test",
            value: 42,
          },
          streamingState: "complete",
        },
      ],
    };

    act(() => {
      result.current.dispatch({
        type: "LOAD_THREAD_MESSAGES",
        threadId: "__placeholder__",
        messages: [testMessage],
        skipIfStreaming: false,
      });
    });

    // Wait a bit to ensure nothing gets added
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should still be empty
    expect(result.current.interactable.interactableComponents).toHaveLength(0);
  });

  it("should not duplicate components that are already interactable", async () => {
    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        dispatch: useStreamDispatch(),
      }),
      {
        wrapper: ({ children }) => (
          <TamboProvider
            apiKey="test-key"
            userKey="test-user"
            components={testComponents}
            autoAddToInteractables={true}
          >
            {children}
          </TamboProvider>
        ),
      },
    );

    // Add a component manually first
    act(() => {
      result.current.interactable.addInteractableComponent({
        name: "TestComponent",
        description: "A test component",
        component: TestComponent,
        propsSchema: z.object({
          title: z.string(),
          value: z.number(),
        }),
        props: {
          title: "Test",
          value: 42,
        },
        state: {},
      });
    });

    expect(result.current.interactable.interactableComponents).toHaveLength(1);

    // Now simulate a message with the same component and props
    const testMessage: TamboThreadMessage = {
      id: "msg_1",
      role: "assistant",
      content: [
        {
          type: "component",
          id: "comp_1",
          name: "TestComponent",
          props: {
            title: "Test",
            value: 42,
          },
          streamingState: "complete",
        },
      ],
    };

    act(() => {
      result.current.dispatch({
        type: "LOAD_THREAD_MESSAGES",
        threadId: "__placeholder__",
        messages: [testMessage],
        skipIfStreaming: false,
      });
    });

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should still only have one interactable
    expect(result.current.interactable.interactableComponents).toHaveLength(1);
  });

  it("should add multiple components from the same message", async () => {
    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        dispatch: useStreamDispatch(),
      }),
      {
        wrapper: ({ children }) => (
          <TamboProvider
            apiKey="test-key"
            userKey="test-user"
            components={testComponents}
            autoAddToInteractables={true}
          >
            {children}
          </TamboProvider>
        ),
      },
    );

    // Simulate a message with multiple components
    const testMessage: TamboThreadMessage = {
      id: "msg_1",
      role: "assistant",
      content: [
        {
          type: "component",
          id: "comp_1",
          name: "TestComponent",
          props: {
            title: "First",
            value: 1,
          },
          streamingState: "complete",
        },
        {
          type: "component",
          id: "comp_2",
          name: "TestComponent",
          props: {
            title: "Second",
            value: 2,
          },
          streamingState: "complete",
        },
      ],
    };

    act(() => {
      result.current.dispatch({
        type: "LOAD_THREAD_MESSAGES",
        threadId: "__placeholder__",
        messages: [testMessage],
        skipIfStreaming: false,
      });
    });

    // Wait for components to be added
    await waitFor(
      () => {
        expect(
          result.current.interactable.interactableComponents,
        ).toHaveLength(2);
      },
      { timeout: 3000 },
    );

    // Verify both components were added
    const interactables = result.current.interactable.interactableComponents;
    expect(interactables[0].props).toEqual({
      title: "First",
      value: 1,
    });
    expect(interactables[1].props).toEqual({
      title: "Second",
      value: 2,
    });
  });
});
