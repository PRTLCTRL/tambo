import { render, waitFor } from "@testing-library/react";
import React from "react";
import { z } from "zod/v3";
import type { TamboComponent } from "../../model/component-metadata";
import { TamboProvider } from "../providers/tambo-v1-provider";
import { useStreamDispatch } from "../providers/tambo-v1-stream-context";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import type { TamboThreadMessage } from "../types/message";

// Test component
const TestComponent: React.FC<{ title: string; content: string }> = ({
  title,
  content,
}) => {
  return (
    <div>
      <h1>{title}</h1>
      <p>{content}</p>
    </div>
  );
};

const testComponents: TamboComponent[] = [
  {
    name: "TestComponent",
    description: "A test component",
    component: TestComponent,
    propsSchema: z.object({
      title: z.string(),
      content: z.string(),
    }),
  },
];

describe("Auto Interactables", () => {
  describe("when autoAddComponentsToInteractables is enabled", () => {
    it("should automatically register generated components as interactables", async () => {
      let interactableComponents: unknown[] = [];

      function TestChild() {
        const dispatch = useStreamDispatch();
        const { interactableComponents: components } = useTamboInteractable();
        interactableComponents = components;

        React.useEffect(() => {
          // Simulate a message with a component
          const message: TamboThreadMessage = {
            id: "msg_1",
            role: "assistant",
            content: [
              {
                type: "component",
                id: "comp_1",
                name: "TestComponent",
                props: { title: "Test Title", content: "Test Content" },
                state: {},
              },
            ],
            createdAt: new Date().toISOString(),
          };

          dispatch({
            type: "ADD_MESSAGE",
            threadId: "placeholder",
            message,
          });
        }, [dispatch]);

        return null;
      }

      render(
        <TamboProvider
          apiKey="test-api-key"
          userKey="test-user"
          components={testComponents}
          autoAddComponentsToInteractables={true}
        >
          <TestChild />
        </TamboProvider>,
      );

      // Wait for the component to be registered as interactable
      await waitFor(
        () => {
          expect(interactableComponents.length).toBeGreaterThan(0);
        },
        { timeout: 3000 },
      );

      // Verify the component was registered
      expect(interactableComponents).toHaveLength(1);
      expect(interactableComponents[0]).toMatchObject({
        name: "TestComponent",
        description: "A test component",
        props: { title: "Test Title", content: "Test Content" },
      });
    });

    it("should not register the same component twice", async () => {
      let interactableComponents: unknown[] = [];

      function TestChild() {
        const dispatch = useStreamDispatch();
        const { interactableComponents: components } = useTamboInteractable();
        interactableComponents = components;

        React.useEffect(() => {
          // Simulate the same message twice
          const message: TamboThreadMessage = {
            id: "msg_1",
            role: "assistant",
            content: [
              {
                type: "component",
                id: "comp_1",
                name: "TestComponent",
                props: { title: "Test Title", content: "Test Content" },
                state: {},
              },
            ],
            createdAt: new Date().toISOString(),
          };

          dispatch({
            type: "ADD_MESSAGE",
            threadId: "placeholder",
            message,
          });

          // Dispatch the same message again
          setTimeout(() => {
            dispatch({
              type: "ADD_MESSAGE",
              threadId: "placeholder",
              message,
            });
          }, 100);
        }, [dispatch]);

        return null;
      }

      render(
        <TamboProvider
          apiKey="test-api-key"
          userKey="test-user"
          components={testComponents}
          autoAddComponentsToInteractables={true}
        >
          <TestChild />
        </TamboProvider>,
      );

      // Wait for processing
      await waitFor(
        () => {
          expect(interactableComponents.length).toBeGreaterThan(0);
        },
        { timeout: 3000 },
      );

      // Should only have one component registered
      expect(interactableComponents).toHaveLength(1);
    });

    it("should handle multiple different components", async () => {
      let interactableComponents: unknown[] = [];

      const AnotherComponent: React.FC<{ value: number }> = ({ value }) => {
        return <div>{value}</div>;
      };

      const multiComponents: TamboComponent[] = [
        ...testComponents,
        {
          name: "AnotherComponent",
          description: "Another test component",
          component: AnotherComponent,
          propsSchema: z.object({
            value: z.number(),
          }),
        },
      ];

      function TestChild() {
        const dispatch = useStreamDispatch();
        const { interactableComponents: components } = useTamboInteractable();
        interactableComponents = components;

        React.useEffect(() => {
          // First component
          dispatch({
            type: "ADD_MESSAGE",
            threadId: "placeholder",
            message: {
              id: "msg_1",
              role: "assistant",
              content: [
                {
                  type: "component",
                  id: "comp_1",
                  name: "TestComponent",
                  props: { title: "First", content: "Content" },
                  state: {},
                },
              ],
              createdAt: new Date().toISOString(),
            },
          });

          // Second component
          setTimeout(() => {
            dispatch({
              type: "ADD_MESSAGE",
              threadId: "placeholder",
              message: {
                id: "msg_2",
                role: "assistant",
                content: [
                  {
                    type: "component",
                    id: "comp_2",
                    name: "AnotherComponent",
                    props: { value: 42 },
                    state: {},
                  },
                ],
                createdAt: new Date().toISOString(),
              },
            });
          }, 100);
        }, [dispatch]);

        return null;
      }

      render(
        <TamboProvider
          apiKey="test-api-key"
          userKey="test-user"
          components={multiComponents}
          autoAddComponentsToInteractables={true}
        >
          <TestChild />
        </TamboProvider>,
      );

      // Wait for both components to be registered
      await waitFor(
        () => {
          expect(interactableComponents.length).toBe(2);
        },
        { timeout: 3000 },
      );

      // Verify both components were registered
      expect(interactableComponents).toHaveLength(2);
      expect(interactableComponents[0]).toMatchObject({
        name: "TestComponent",
      });
      expect(interactableComponents[1]).toMatchObject({
        name: "AnotherComponent",
      });
    });
  });

  describe("when autoAddComponentsToInteractables is disabled", () => {
    it("should not automatically register generated components", async () => {
      let interactableComponents: unknown[] = [];

      function TestChild() {
        const dispatch = useStreamDispatch();
        const { interactableComponents: components } = useTamboInteractable();
        interactableComponents = components;

        React.useEffect(() => {
          // Simulate a message with a component
          const message: TamboThreadMessage = {
            id: "msg_1",
            role: "assistant",
            content: [
              {
                type: "component",
                id: "comp_1",
                name: "TestComponent",
                props: { title: "Test Title", content: "Test Content" },
                state: {},
              },
            ],
            createdAt: new Date().toISOString(),
          };

          dispatch({
            type: "ADD_MESSAGE",
            threadId: "placeholder",
            message,
          });
        }, [dispatch]);

        return null;
      }

      render(
        <TamboProvider
          apiKey="test-api-key"
          userKey="test-user"
          components={testComponents}
          autoAddComponentsToInteractables={false}
        >
          <TestChild />
        </TamboProvider>,
      );

      // Wait a bit to ensure no registration happens
      await new Promise((resolve) => {
        setTimeout(resolve, 500);
      });

      // Should have no interactable components
      expect(interactableComponents).toHaveLength(0);
    });
  });

  describe("when autoAddComponentsToInteractables is not provided", () => {
    it("should default to false and not register components", async () => {
      let interactableComponents: unknown[] = [];

      function TestChild() {
        const dispatch = useStreamDispatch();
        const { interactableComponents: components } = useTamboInteractable();
        interactableComponents = components;

        React.useEffect(() => {
          const message: TamboThreadMessage = {
            id: "msg_1",
            role: "assistant",
            content: [
              {
                type: "component",
                id: "comp_1",
                name: "TestComponent",
                props: { title: "Test Title", content: "Test Content" },
                state: {},
              },
            ],
            createdAt: new Date().toISOString(),
          };

          dispatch({
            type: "ADD_MESSAGE",
            threadId: "placeholder",
            message,
          });
        }, [dispatch]);

        return null;
      }

      render(
        <TamboProvider
          apiKey="test-api-key"
          userKey="test-user"
          components={testComponents}
        >
          <TestChild />
        </TamboProvider>,
      );

      // Wait a bit
      await new Promise((resolve) => {
        setTimeout(resolve, 500);
      });

      // Should have no interactable components
      expect(interactableComponents).toHaveLength(0);
    });
  });
});
