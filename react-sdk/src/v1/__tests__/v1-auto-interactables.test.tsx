import { act, renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { z } from "zod/v3";
import { TamboProvider } from "../providers/tambo-v1-provider";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import type { TamboThreadMessage } from "../types/message";
import type { TamboComponentContent } from "@tambo-ai/client";
import { useStreamDispatch, useStreamState } from "../providers/tambo-v1-stream-context";

const TestComponent = ({ title }: { title: string }) => <div>{title}</div>;

const testComponents = [
  {
    name: "TestCard",
    description: "A test card component",
    component: TestComponent,
    propsSchema: z.object({
      title: z.string(),
      subtitle: z.string().optional(),
    }),
  },
];

describe("Auto Interactables", () => {
  it("automatically adds components to interactables when autoInteractables is enabled", async () => {
    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        dispatch: useStreamDispatch(),
        state: useStreamState(),
      }),
      {
        wrapper: ({ children }) => (
          <TamboProvider
            apiKey="test-key"
            userKey="test-user"
            components={testComponents}
            autoInteractables={true}
          >
            {children}
          </TamboProvider>
        ),
      },
    );

    await act(async () => {
      result.current.dispatch({
        type: "INIT_THREAD",
        threadId: "test-thread-1",
      });
    });

    expect(result.current.interactable.interactableComponents).toHaveLength(0);

    const componentContent: TamboComponentContent = {
      type: "component",
      componentName: "TestCard",
      props: {
        title: "Test Title",
        subtitle: "Test Subtitle",
      },
      streamingState: "complete",
    };

    const message: TamboThreadMessage = {
      id: "msg-1",
      role: "assistant",
      content: [componentContent],
    };

    await act(async () => {
      result.current.dispatch({
        type: "ADD_ASSISTANT_MESSAGE",
        threadId: "test-thread-1",
        message,
      });
    });

    await waitFor(() => {
      expect(result.current.interactable.interactableComponents.length).toBeGreaterThan(0);
    });

    const addedComponent = result.current.interactable.interactableComponents[0];
    expect(addedComponent.name).toBe("TestCard");
    expect(addedComponent.props).toEqual({
      title: "Test Title",
      subtitle: "Test Subtitle",
    });
  });

  it("does not add components when autoInteractables is disabled", async () => {
    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        dispatch: useStreamDispatch(),
        state: useStreamState(),
      }),
      {
        wrapper: ({ children }) => (
          <TamboProvider
            apiKey="test-key"
            userKey="test-user"
            components={testComponents}
            autoInteractables={false}
          >
            {children}
          </TamboProvider>
        ),
      },
    );

    await act(async () => {
      result.current.dispatch({
        type: "INIT_THREAD",
        threadId: "test-thread-2",
      });
    });

    const componentContent: TamboComponentContent = {
      type: "component",
      componentName: "TestCard",
      props: {
        title: "Test Title",
      },
      streamingState: "complete",
    };

    const message: TamboThreadMessage = {
      id: "msg-2",
      role: "assistant",
      content: [componentContent],
    };

    await act(async () => {
      result.current.dispatch({
        type: "ADD_ASSISTANT_MESSAGE",
        threadId: "test-thread-2",
        message,
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(result.current.interactable.interactableComponents).toHaveLength(0);
  });

  it("does not add the same component twice", async () => {
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
            autoInteractables={true}
          >
            {children}
          </TamboProvider>
        ),
      },
    );

    await act(async () => {
      result.current.dispatch({
        type: "INIT_THREAD",
        threadId: "test-thread-3",
      });
    });

    const componentContent: TamboComponentContent = {
      type: "component",
      componentName: "TestCard",
      props: {
        title: "Test Title",
      },
      streamingState: "complete",
    };

    const message: TamboThreadMessage = {
      id: "msg-3",
      role: "assistant",
      content: [componentContent],
    };

    await act(async () => {
      result.current.dispatch({
        type: "ADD_ASSISTANT_MESSAGE",
        threadId: "test-thread-3",
        message,
      });
    });

    await waitFor(() => {
      expect(result.current.interactable.interactableComponents.length).toBe(1);
    });

    await act(async () => {
      result.current.dispatch({
        type: "ADD_ASSISTANT_MESSAGE",
        threadId: "test-thread-3",
        message,
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(result.current.interactable.interactableComponents).toHaveLength(1);
  });
});
