import { renderHook, act, waitFor } from "@testing-library/react";
import React from "react";
import { z } from "zod/v3";
import { TamboProvider } from "../v1/providers/tambo-v1-provider";
import { useTamboInteractable } from "./tambo-interactable-provider";
import { useStreamDispatch } from "../v1/providers/tambo-v1-stream-context";
import type { TamboComponent } from "../model/component-metadata";

const TestComponent: React.FC<{ title: string; content?: string }> = () => (
  <div>Test</div>
);

const components: TamboComponent[] = [
  {
    name: "TestComponent",
    description: "A test component",
    component: TestComponent,
    props: z.object({
      title: z.string(),
      content: z.string().optional(),
    }),
  },
];

describe("TamboInteractableProvider - Auto Add Feature", () => {
  it("should NOT auto-add components when autoAddToInteractables is false", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={components}
        autoAddToInteractables={false}
      >
        {children}
      </TamboProvider>
    );

    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        dispatch: useStreamDispatch(),
      }),
      { wrapper },
    );

    act(() => {
      result.current.dispatch({
        type: "COMPONENT_DELTA",
        threadId: "thread-1",
        messageId: "msg-1",
        componentId: "comp-1",
        delta: {
          type: "component",
          id: "comp-1",
          name: "TestComponent",
          props: { title: "Test Title" },
          streamingState: "done",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.interactable.interactableComponents).toHaveLength(
        0,
      );
    });
  });

  it("should auto-add components when autoAddToInteractables is true", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={components}
        autoAddToInteractables={true}
      >
        {children}
      </TamboProvider>
    );

    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        dispatch: useStreamDispatch(),
      }),
      { wrapper },
    );

    act(() => {
      result.current.dispatch({
        type: "COMPONENT_DELTA",
        threadId: "thread-1",
        messageId: "msg-1",
        componentId: "comp-1",
        delta: {
          type: "component",
          id: "comp-1",
          name: "TestComponent",
          props: { title: "Auto Added Title" },
          streamingState: "done",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.interactable.interactableComponents.length).toBe(1);
    });

    const addedComponent =
      result.current.interactable.interactableComponents[0];
    expect(addedComponent.name).toBe("TestComponent");
    expect(addedComponent.props).toEqual({ title: "Auto Added Title" });
  });

  it("should auto-add multiple components from the same message", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={components}
        autoAddToInteractables={true}
      >
        {children}
      </TamboProvider>
    );

    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        dispatch: useStreamDispatch(),
      }),
      { wrapper },
    );

    act(() => {
      result.current.dispatch({
        type: "COMPONENT_DELTA",
        threadId: "thread-1",
        messageId: "msg-1",
        componentId: "comp-1",
        delta: {
          type: "component",
          id: "comp-1",
          name: "TestComponent",
          props: { title: "First Component" },
          streamingState: "done",
        },
      });

      result.current.dispatch({
        type: "COMPONENT_DELTA",
        threadId: "thread-1",
        messageId: "msg-1",
        componentId: "comp-2",
        delta: {
          type: "component",
          id: "comp-2",
          name: "TestComponent",
          props: { title: "Second Component" },
          streamingState: "done",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.interactable.interactableComponents.length).toBe(2);
    });

    const components = result.current.interactable.interactableComponents;
    expect(components[0].props.title).toBe("First Component");
    expect(components[1].props.title).toBe("Second Component");
  });

  it("should not duplicate components if the same component appears twice", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={components}
        autoAddToInteractables={true}
      >
        {children}
      </TamboProvider>
    );

    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        dispatch: useStreamDispatch(),
      }),
      { wrapper },
    );

    act(() => {
      result.current.dispatch({
        type: "COMPONENT_DELTA",
        threadId: "thread-1",
        messageId: "msg-1",
        componentId: "comp-1",
        delta: {
          type: "component",
          id: "comp-1",
          name: "TestComponent",
          props: { title: "Same Component" },
          streamingState: "done",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.interactable.interactableComponents.length).toBe(1);
    });

    act(() => {
      result.current.dispatch({
        type: "COMPONENT_DELTA",
        threadId: "thread-1",
        messageId: "msg-1",
        componentId: "comp-1",
        delta: {
          type: "component",
          id: "comp-1",
          name: "TestComponent",
          props: { title: "Same Component" },
          streamingState: "done",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.interactable.interactableComponents.length).toBe(1);
    });
  });

  it("should handle components not in registry gracefully", async () => {
    const consoleWarnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => {});

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={components}
        autoAddToInteractables={true}
      >
        {children}
      </TamboProvider>
    );

    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        dispatch: useStreamDispatch(),
      }),
      { wrapper },
    );

    act(() => {
      result.current.dispatch({
        type: "COMPONENT_DELTA",
        threadId: "thread-1",
        messageId: "msg-1",
        componentId: "comp-1",
        delta: {
          type: "component",
          id: "comp-1",
          name: "UnknownComponent",
          props: { title: "Unknown" },
          streamingState: "done",
        },
      });
    });

    await waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Cannot auto-add component "UnknownComponent"',
        ),
      );
    });

    expect(result.current.interactable.interactableComponents).toHaveLength(0);

    consoleWarnSpy.mockRestore();
  });
});
