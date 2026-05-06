import React from "react";
import { render, waitFor } from "@testing-library/react";
import { z } from "zod";
import { TamboProvider } from "../tambo-v1-provider";
import { useTamboInteractable } from "../../../providers/tambo-interactable-provider";
import { useStreamDispatch } from "../tambo-v1-stream-context";
import type { TamboComponent } from "../../../model/component-metadata";

// Test component
const TestCard: React.FC<{ title: string; content: string }> = ({
  title,
  content,
}) => (
  <div>
    <h2>{title}</h2>
    <p>{content}</p>
  </div>
);

const testComponents: TamboComponent[] = [
  {
    name: "TestCard",
    description: "A simple test card component",
    component: TestCard,
    propsSchema: z.object({
      title: z.string(),
      content: z.string(),
    }),
  },
];

describe("TamboAutoInteractables", () => {
  it("should not add components to interactables when autoAddToInteractables is false", async () => {
    let interactableComponents: any[] = [];

    function TestConsumer() {
      const { interactableComponents: components } = useTamboInteractable();
      interactableComponents = components;
      return null;
    }

    function MessageSimulator() {
      const dispatch = useStreamDispatch();

      React.useEffect(() => {
        // Simulate receiving a component in a message
        dispatch({
          type: "EVENT",
          event: {
            event: "component",
            data: {
              id: "comp_123",
              name: "TestCard",
              props: { title: "Test", content: "Hello" },
            },
          },
        });
      }, [dispatch]);

      return null;
    }

    render(
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={testComponents}
        autoAddToInteractables={false}
      >
        <MessageSimulator />
        <TestConsumer />
      </TamboProvider>,
    );

    // Wait a bit for any async updates
    await waitFor(() => {
      expect(interactableComponents).toHaveLength(0);
    });
  });

  it("should add components to interactables when autoAddToInteractables is true", async () => {
    let interactableComponents: any[] = [];

    function TestConsumer() {
      const { interactableComponents: components } = useTamboInteractable();
      interactableComponents = components;
      return null;
    }

    function MessageSimulator() {
      const dispatch = useStreamDispatch();

      React.useEffect(() => {
        // Simulate receiving a component in a message
        dispatch({
          type: "EVENT",
          event: {
            event: "component",
            data: {
              id: "comp_123",
              name: "TestCard",
              props: { title: "Test", content: "Hello" },
            },
          },
        });
      }, [dispatch]);

      return null;
    }

    render(
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={testComponents}
        autoAddToInteractables={true}
      >
        <MessageSimulator />
        <TestConsumer />
      </TamboProvider>,
    );

    // Wait for the component to be added
    await waitFor(
      () => {
        expect(interactableComponents.length).toBeGreaterThan(0);
      },
      { timeout: 2000 },
    );

    // Verify the component was added with correct props
    expect(interactableComponents[0]).toMatchObject({
      name: "TestCard",
      props: { title: "Test", content: "Hello" },
    });
  });

  it("should not add the same component twice", async () => {
    let interactableComponents: any[] = [];

    function TestConsumer() {
      const { interactableComponents: components } = useTamboInteractable();
      interactableComponents = components;
      return null;
    }

    function MessageSimulator() {
      const dispatch = useStreamDispatch();

      React.useEffect(() => {
        // Simulate receiving the same component twice
        dispatch({
          type: "EVENT",
          event: {
            event: "component",
            data: {
              id: "comp_123",
              name: "TestCard",
              props: { title: "Test", content: "Hello" },
            },
          },
        });

        // Simulate the same component again (shouldn't add again)
        setTimeout(() => {
          dispatch({
            type: "EVENT",
            event: {
              event: "component",
              data: {
                id: "comp_123",
                name: "TestCard",
                props: { title: "Test", content: "Hello" },
              },
            },
          });
        }, 100);
      }, [dispatch]);

      return null;
    }

    render(
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={testComponents}
        autoAddToInteractables={true}
      >
        <MessageSimulator />
        <TestConsumer />
      </TamboProvider>,
    );

    // Wait for the component to be added
    await waitFor(
      () => {
        expect(interactableComponents.length).toBeGreaterThan(0);
      },
      { timeout: 2000 },
    );

    // Wait a bit more to ensure second dispatch was processed
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Should still only have one interactable (not duplicated)
    expect(interactableComponents).toHaveLength(1);
  });
});
