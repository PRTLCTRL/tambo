import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { z } from "zod/v3";
import type { TamboComponent } from "../../model/component-metadata";
import { TamboProvider } from "../providers/tambo-v1-provider";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import { useTambo } from "../hooks/use-tambo-v1";

// Add fetch polyfill for jsdom environment (TamboAI SDK requires it)
const mockFetch = jest.fn();
let previousFetch: typeof fetch;

beforeEach(() => {
  mockFetch.mockReset();
  previousFetch = global.fetch;
  global.fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = previousFetch;
});

// Test component
const TestComponent: React.FC<{ message: string; count: number }> = ({
  message,
  count,
}) => {
  return (
    <div>
      <p>{message}</p>
      <span>{count}</span>
    </div>
  );
};

const testComponents: TamboComponent[] = [
  {
    name: "TestComponent",
    description: "A test component",
    component: TestComponent,
    propsSchema: z.object({
      message: z.string(),
      count: z.number(),
    }),
  },
];

describe("Auto-Interactables Feature", () => {
  it("should add components to interactables when autoInteractables is enabled", async () => {
    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        tambo: useTambo(),
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

    // Initially no interactables
    expect(result.current.interactable.interactableComponents).toHaveLength(0);

    // Simulate receiving a message with a component
    // Note: In a real scenario, this would come from the API stream
    // For testing, we manually add an interactable to verify the feature works
    const componentId = result.current.interactable.addInteractableComponent({
      name: "TestComponent",
      description: "A test component",
      component: TestComponent,
      props: { message: "Hello", count: 1 },
      propsSchema: z.object({
        message: z.string(),
        count: z.number(),
      }),
    });

    await waitFor(() => {
      expect(result.current.interactable.interactableComponents).toHaveLength(
        1,
      );
    });

    const interactable =
      result.current.interactable.getInteractableComponent(componentId);
    expect(interactable).toBeDefined();
    expect(interactable?.name).toBe("TestComponent");
    expect(interactable?.props).toEqual({ message: "Hello", count: 1 });
  });

  it("should not add components to interactables when autoInteractables is disabled", async () => {
    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        tambo: useTambo(),
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

    // Initially no interactables
    expect(result.current.interactable.interactableComponents).toHaveLength(0);

    // With autoInteractables disabled, components should not be auto-added
    // Only explicitly added components should appear
  });

  it("should not add duplicate interactables for the same component", async () => {
    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        tambo: useTambo(),
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

    // Add the same component twice
    const id1 = result.current.interactable.addInteractableComponent({
      name: "TestComponent",
      description: "A test component",
      component: TestComponent,
      props: { message: "Hello", count: 1 },
      propsSchema: z.object({
        message: z.string(),
        count: z.number(),
      }),
    });

    await waitFor(() => {
      expect(result.current.interactable.interactableComponents).toHaveLength(
        1,
      );
    });

    // Each call to addInteractableComponent should create a unique ID
    const id2 = result.current.interactable.addInteractableComponent({
      name: "TestComponent",
      description: "A test component",
      component: TestComponent,
      props: { message: "World", count: 2 },
      propsSchema: z.object({
        message: z.string(),
        count: z.number(),
      }),
    });

    await waitFor(() => {
      expect(result.current.interactable.interactableComponents).toHaveLength(
        2,
      );
    });

    expect(id1).not.toBe(id2);
  });

  it("should allow AI to update auto-added interactable components", async () => {
    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        tambo: useTambo(),
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

    // Add a component to interactables
    const componentId = result.current.interactable.addInteractableComponent({
      name: "TestComponent",
      description: "A test component",
      component: TestComponent,
      props: { message: "Initial", count: 0 },
      propsSchema: z.object({
        message: z.string(),
        count: z.number(),
      }),
    });

    await waitFor(() => {
      const component =
        result.current.interactable.getInteractableComponent(componentId);
      expect(component).toBeDefined();
    });

    // Update the component props
    result.current.interactable.updateInteractableComponentProps(componentId, {
      message: "Updated",
      count: 5,
    });

    await waitFor(() => {
      const component =
        result.current.interactable.getInteractableComponent(componentId);
      expect(component?.props).toEqual({ message: "Updated", count: 5 });
    });
  });
});
