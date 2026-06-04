/**
 * Tests for automatic interactables feature.
 */

import { render, waitFor } from "@testing-library/react";
import React from "react";
import { z } from "zod/v3";
import { TamboInteractableProvider } from "./tambo-interactable-provider";
import { TamboRegistryProvider } from "./tambo-registry-provider";
import { TamboContextHelpersProvider } from "./tambo-context-helpers-provider";
import { TamboProvider } from "../v1/providers/tambo-v1-provider";
import { useTamboInteractable } from "./tambo-interactable-provider";
import type { TamboComponentContent } from "../types/message";
import { TamboStreamProvider } from "../v1/providers/tambo-v1-stream-context";
import { useStreamDispatch } from "../v1/providers/tambo-v1-stream-context";
import type { TamboThread } from "@tambo-ai/client";

// Mock component for testing
const TestComponent = ({ title, content }: { title: string; content: string }) => {
  return (
    <div>
      <h1>{title}</h1>
      <p>{content}</p>
    </div>
  );
};

const TestComponentSchema = z.object({
  title: z.string(),
  content: z.string(),
});

describe("TamboInteractableProvider - Auto Interactables", () => {
  it("should automatically add generated components when autoInteractables is enabled", async () => {
    let interactablesCount = 0;

    function TestConsumer() {
      const { interactableComponents } = useTamboInteractable();
      const dispatch = useStreamDispatch();

      React.useEffect(() => {
        // Simulate a component being generated
        dispatch({
          type: "EVENT",
          threadId: "test-thread",
          event: {
            type: "custom" as any,
            name: "tambo.component.start",
            value: {
              messageId: "msg-1",
              componentId: "comp-1",
              componentName: "TestComponent",
            },
          },
        });

        // Simulate props streaming
        dispatch({
          type: "EVENT",
          threadId: "test-thread",
          event: {
            type: "custom" as any,
            name: "tambo.component.props_delta",
            value: {
              componentId: "comp-1",
              operations: [
                { op: "add", path: "/title", value: "Test Title" },
                { op: "add", path: "/content", value: "Test Content" },
              ],
            },
          },
        });

        // Simulate component end
        dispatch({
          type: "EVENT",
          threadId: "test-thread",
          event: {
            type: "custom" as any,
            name: "tambo.component.end",
            value: {
              componentId: "comp-1",
            },
          },
        });
      }, [dispatch]);

      React.useEffect(() => {
        interactablesCount = interactableComponents.length;
      }, [interactableComponents]);

      return null;
    }

    const components = [
      {
        name: "TestComponent",
        description: "A test component",
        component: TestComponent,
        propsSchema: TestComponentSchema,
      },
    ];

    render(
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={components}
        autoInteractables={true}
      >
        <TestConsumer />
      </TamboProvider>,
    );

    await waitFor(
      () => {
        expect(interactablesCount).toBeGreaterThan(0);
      },
      { timeout: 1000 },
    );
  });

  it("should not automatically add components when autoInteractables is disabled", async () => {
    let interactablesCount = 0;

    function TestConsumer() {
      const { interactableComponents } = useTamboInteractable();
      const dispatch = useStreamDispatch();

      React.useEffect(() => {
        // Simulate a component being generated
        dispatch({
          type: "EVENT",
          threadId: "test-thread",
          event: {
            type: "custom" as any,
            name: "tambo.component.start",
            value: {
              messageId: "msg-1",
              componentId: "comp-1",
              componentName: "TestComponent",
            },
          },
        });

        // Simulate component end
        dispatch({
          type: "EVENT",
          threadId: "test-thread",
          event: {
            type: "custom" as any,
            name: "tambo.component.end",
            value: {
              componentId: "comp-1",
            },
          },
        });
      }, [dispatch]);

      React.useEffect(() => {
        interactablesCount = interactableComponents.length;
      }, [interactableComponents]);

      return null;
    }

    const components = [
      {
        name: "TestComponent",
        description: "A test component",
        component: TestComponent,
        propsSchema: TestComponentSchema,
      },
    ];

    render(
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={components}
        autoInteractables={false}
      >
        <TestConsumer />
      </TamboProvider>,
    );

    // Wait a bit to ensure no components are added
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(interactablesCount).toBe(0);
  });

  it("should not add duplicate components", async () => {
    let interactablesCount = 0;

    function TestConsumer() {
      const { interactableComponents } = useTamboInteractable();
      const dispatch = useStreamDispatch();

      React.useEffect(() => {
        // Simulate the same component being generated twice
        for (let i = 0; i < 2; i++) {
          dispatch({
            type: "EVENT",
            threadId: "test-thread",
            event: {
              type: "custom" as any,
              name: "tambo.component.start",
              value: {
                messageId: "msg-1",
                componentId: "comp-1",
                componentName: "TestComponent",
              },
            },
          });

          dispatch({
            type: "EVENT",
            threadId: "test-thread",
            event: {
              type: "custom" as any,
              name: "tambo.component.end",
              value: {
                componentId: "comp-1",
              },
            },
          });
        }
      }, [dispatch]);

      React.useEffect(() => {
        interactablesCount = interactableComponents.length;
      }, [interactableComponents]);

      return null;
    }

    const components = [
      {
        name: "TestComponent",
        description: "A test component",
        component: TestComponent,
        propsSchema: TestComponentSchema,
      },
    ];

    render(
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={components}
        autoInteractables={true}
      >
        <TestConsumer />
      </TamboProvider>,
    );

    await waitFor(
      () => {
        // Should only add once, not twice
        expect(interactablesCount).toBe(1);
      },
      { timeout: 1000 },
    );
  });

  it("should warn when component is not in registry", async () => {
    const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

    function TestConsumer() {
      const dispatch = useStreamDispatch();

      React.useEffect(() => {
        // Simulate an unknown component being generated
        dispatch({
          type: "EVENT",
          threadId: "test-thread",
          event: {
            type: "custom" as any,
            name: "tambo.component.start",
            value: {
              messageId: "msg-1",
              componentId: "comp-1",
              componentName: "UnknownComponent",
            },
          },
        });

        dispatch({
          type: "EVENT",
          threadId: "test-thread",
          event: {
            type: "custom" as any,
            name: "tambo.component.end",
            value: {
              componentId: "comp-1",
            },
          },
        });
      }, [dispatch]);

      return null;
    }

    const components = [
      {
        name: "TestComponent",
        description: "A test component",
        component: TestComponent,
        propsSchema: TestComponentSchema,
      },
    ];

    render(
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={components}
        autoInteractables={true}
      >
        <TestConsumer />
      </TamboProvider>,
    );

    await waitFor(
      () => {
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining("Component \"UnknownComponent\" not found in registry"),
        );
      },
      { timeout: 1000 },
    );

    consoleSpy.mockRestore();
  });
});
