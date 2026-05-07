import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { z } from "zod/v3";
import type { TamboComponent } from "../../model/component-metadata";
import { TamboProvider } from "../providers/tambo-v1-provider";
import { useTambo } from "../hooks/use-tambo-v1";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import type { StreamState } from "@tambo-ai/client";

describe("Auto-add components to interactables", () => {
  const TestComponent: React.FC<{ title: string; content: string }> = ({
    title,
    content,
  }) => (
    <div>
      <h1>{title}</h1>
      <p>{content}</p>
    </div>
  );

  const testComponents: TamboComponent[] = [
    {
      name: "TestComponent",
      description: "A test component for demonstration",
      component: TestComponent,
      propsSchema: z.object({
        title: z.string(),
        content: z.string(),
      }),
    },
  ];

  const createTestWrapper = (autoAddToInteractables: boolean) => {
    return ({ children }: { children: React.ReactNode }) => (
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={testComponents}
        autoAddToInteractables={autoAddToInteractables}
      >
        {children}
      </TamboProvider>
    );
  };

  it("should not add components to interactables when autoAddToInteractables is false", async () => {
    const { result } = renderHook(
      () => ({
        tambo: useTambo(),
        interactable: useTamboInteractable(),
      }),
      {
        wrapper: createTestWrapper(false),
      },
    );

    // Manually dispatch a message with a component
    result.current.tambo.dispatch({
      type: "EVENT",
      threadId: result.current.tambo.currentThreadId,
      event: {
        type: "component_created",
        componentId: "comp_1",
        componentName: "TestComponent",
        props: { title: "Test", content: "Content" },
        timestamp: Date.now(),
      },
    });

    await waitFor(() => {
      expect(result.current.tambo.messages.length).toBeGreaterThan(0);
    });

    // Check that the component was NOT added to interactables
    expect(result.current.interactable.interactableComponents).toHaveLength(0);
  });

  it("should add components to interactables when autoAddToInteractables is true", async () => {
    const { result } = renderHook(
      () => ({
        tambo: useTambo(),
        interactable: useTamboInteractable(),
      }),
      {
        wrapper: createTestWrapper(true),
      },
    );

    // Manually dispatch a message with a component
    result.current.tambo.dispatch({
      type: "EVENT",
      threadId: result.current.tambo.currentThreadId,
      event: {
        type: "component_created",
        componentId: "comp_1",
        componentName: "TestComponent",
        props: { title: "Test", content: "Content" },
        timestamp: Date.now(),
      },
    });

    await waitFor(() => {
      expect(result.current.tambo.messages.length).toBeGreaterThan(0);
    });

    // Check that the component was added to interactables
    await waitFor(() => {
      expect(
        result.current.interactable.interactableComponents.length,
      ).toBeGreaterThan(0);
    });

    const interactable = result.current.interactable.interactableComponents[0];
    expect(interactable.name).toBe("TestComponent");
    expect(interactable.props).toEqual({ title: "Test", content: "Content" });
  });

  it("should not add duplicate components to interactables", async () => {
    const { result } = renderHook(
      () => ({
        tambo: useTambo(),
        interactable: useTamboInteractable(),
      }),
      {
        wrapper: createTestWrapper(true),
      },
    );

    const componentId = "comp_1";

    // Dispatch the same component event twice
    result.current.tambo.dispatch({
      type: "EVENT",
      threadId: result.current.tambo.currentThreadId,
      event: {
        type: "component_created",
        componentId,
        componentName: "TestComponent",
        props: { title: "Test", content: "Content" },
        timestamp: Date.now(),
      },
    });

    result.current.tambo.dispatch({
      type: "EVENT",
      threadId: result.current.tambo.currentThreadId,
      event: {
        type: "component_created",
        componentId,
        componentName: "TestComponent",
        props: { title: "Test", content: "Content" },
        timestamp: Date.now(),
      },
    });

    await waitFor(() => {
      expect(result.current.tambo.messages.length).toBeGreaterThan(0);
    });

    // Check that only one interactable was created
    await waitFor(() => {
      expect(result.current.interactable.interactableComponents).toHaveLength(
        1,
      );
    });
  });

  it("should add multiple different components to interactables", async () => {
    const { result } = renderHook(
      () => ({
        tambo: useTambo(),
        interactable: useTamboInteractable(),
      }),
      {
        wrapper: createTestWrapper(true),
      },
    );

    // Dispatch two different components
    result.current.tambo.dispatch({
      type: "EVENT",
      threadId: result.current.tambo.currentThreadId,
      event: {
        type: "component_created",
        componentId: "comp_1",
        componentName: "TestComponent",
        props: { title: "First", content: "First content" },
        timestamp: Date.now(),
      },
    });

    result.current.tambo.dispatch({
      type: "EVENT",
      threadId: result.current.tambo.currentThreadId,
      event: {
        type: "component_created",
        componentId: "comp_2",
        componentName: "TestComponent",
        props: { title: "Second", content: "Second content" },
        timestamp: Date.now(),
      },
    });

    await waitFor(() => {
      expect(result.current.tambo.messages.length).toBeGreaterThan(0);
    });

    // Check that both components were added
    await waitFor(() => {
      expect(result.current.interactable.interactableComponents).toHaveLength(
        2,
      );
    });

    expect(result.current.interactable.interactableComponents[0].props).toEqual(
      { title: "First", content: "First content" },
    );
    expect(result.current.interactable.interactableComponents[1].props).toEqual(
      { title: "Second", content: "Second content" },
    );
  });

  it("should skip components not in the registry", async () => {
    const { result } = renderHook(
      () => ({
        tambo: useTambo(),
        interactable: useTamboInteractable(),
      }),
      {
        wrapper: createTestWrapper(true),
      },
    );

    // Dispatch a component that doesn't exist in the registry
    result.current.tambo.dispatch({
      type: "EVENT",
      threadId: result.current.tambo.currentThreadId,
      event: {
        type: "component_created",
        componentId: "comp_unknown",
        componentName: "UnknownComponent",
        props: { some: "props" },
        timestamp: Date.now(),
      },
    });

    await waitFor(() => {
      expect(result.current.tambo.messages.length).toBeGreaterThan(0);
    });

    // Check that no interactable was created
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(result.current.interactable.interactableComponents).toHaveLength(0);
  });
});
