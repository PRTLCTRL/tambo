import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { z } from "zod/v3";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import type { TamboComponent } from "../../model/component-metadata";
import { TamboProvider } from "../providers/tambo-v1-provider";
import { useTambo } from "../hooks/use-tambo-v1";

// Simple test components
const TestCard: React.FC<{ title: string; content: string }> = ({
  title,
  content,
}) => (
  <div>
    <h3>{title}</h3>
    <p>{content}</p>
  </div>
);

const TestChart: React.FC<{ data: Array<{ x: number; y: number }> }> = ({
  data,
}) => (
  <div>
    <ul>
      {data.map((point, i) => (
        <li key={i}>
          {point.x}, {point.y}
        </li>
      ))}
    </ul>
  </div>
);

const testComponents: TamboComponent[] = [
  {
    name: "TestCard",
    description: "A test card component",
    component: TestCard,
    props: z.object({
      title: z.string(),
      content: z.string(),
    }),
  },
  {
    name: "TestChart",
    description: "A test chart component",
    component: TestChart,
    props: z.object({
      data: z.array(z.object({ x: z.number(), y: z.number() })),
    }),
  },
];

describe("Auto-add interactables", () => {
  const mockApiKey = "test-api-key";

  describe("when autoAddInteractables is disabled (default)", () => {
    it("should not auto-add components to interactables", async () => {
      const { result } = renderHook(
        () => ({
          tambo: useTambo(),
          interactable: useTamboInteractable(),
        }),
        {
          wrapper: ({ children }) => (
            <TamboProvider
              apiKey={mockApiKey}
              userKey="test-user"
              components={testComponents}
            >
              {children}
            </TamboProvider>
          ),
        },
      );

      // Initially no interactables
      expect(result.current.interactable.interactableComponents).toHaveLength(
        0,
      );

      // Simulate receiving a message with a component
      const { dispatch } = result.current.tambo;
      dispatch({
        type: "APPEND_MESSAGE",
        threadId: result.current.tambo.currentThreadId,
        message: {
          id: "msg-1",
          role: "assistant",
          content: [
            {
              type: "component",
              id: "comp-1",
              name: "TestCard",
              props: { title: "Test", content: "Content" },
              streamingState: "complete",
            },
          ],
          createdAt: new Date().toISOString(),
        },
      });

      // Wait a bit to see if anything gets added
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });

      // Should still have no interactables
      expect(result.current.interactable.interactableComponents).toHaveLength(
        0,
      );
    });
  });

  describe("when autoAddInteractables is enabled", () => {
    it("should auto-add components to interactables when they appear in messages", async () => {
      const { result } = renderHook(
        () => ({
          tambo: useTambo(),
          interactable: useTamboInteractable(),
        }),
        {
          wrapper: ({ children }) => (
            <TamboProvider
              apiKey={mockApiKey}
              userKey="test-user"
              components={testComponents}
              autoAddInteractables={true}
            >
              {children}
            </TamboProvider>
          ),
        },
      );

      // Initially no interactables
      expect(result.current.interactable.interactableComponents).toHaveLength(
        0,
      );

      // Simulate receiving a message with a component
      const { dispatch } = result.current.tambo;
      dispatch({
        type: "APPEND_MESSAGE",
        threadId: result.current.tambo.currentThreadId,
        message: {
          id: "msg-1",
          role: "assistant",
          content: [
            {
              type: "component",
              id: "comp-1",
              name: "TestCard",
              props: { title: "Test", content: "Content" },
              streamingState: "complete",
            },
          ],
          createdAt: new Date().toISOString(),
        },
      });

      // Wait for the auto-add to happen
      await waitFor(() => {
        expect(result.current.interactable.interactableComponents.length).toBe(
          1,
        );
      });

      const addedComponent = result.current.interactable.interactableComponents[0];
      expect(addedComponent.name).toBe("TestCard");
      expect(addedComponent.props).toEqual({
        title: "Test",
        content: "Content",
      });
    });

    it("should auto-add multiple components from the same message", async () => {
      const { result } = renderHook(
        () => ({
          tambo: useTambo(),
          interactable: useTamboInteractable(),
        }),
        {
          wrapper: ({ children }) => (
            <TamboProvider
              apiKey={mockApiKey}
              userKey="test-user"
              components={testComponents}
              autoAddInteractables={true}
            >
              {children}
            </TamboProvider>
          ),
        },
      );

      const { dispatch } = result.current.tambo;
      dispatch({
        type: "APPEND_MESSAGE",
        threadId: result.current.tambo.currentThreadId,
        message: {
          id: "msg-1",
          role: "assistant",
          content: [
            {
              type: "component",
              id: "comp-1",
              name: "TestCard",
              props: { title: "Card 1", content: "Content 1" },
              streamingState: "complete",
            },
            {
              type: "component",
              id: "comp-2",
              name: "TestChart",
              props: { data: [{ x: 1, y: 2 }] },
              streamingState: "complete",
            },
          ],
          createdAt: new Date().toISOString(),
        },
      });

      await waitFor(() => {
        expect(result.current.interactable.interactableComponents.length).toBe(
          2,
        );
      });

      const components = result.current.interactable.interactableComponents;
      expect(components[0].name).toBe("TestCard");
      expect(components[1].name).toBe("TestChart");
    });

    it("should not add the same component twice", async () => {
      const { result } = renderHook(
        () => ({
          tambo: useTambo(),
          interactable: useTamboInteractable(),
        }),
        {
          wrapper: ({ children }) => (
            <TamboProvider
              apiKey={mockApiKey}
              userKey="test-user"
              components={testComponents}
              autoAddInteractables={true}
            >
              {children}
            </TamboProvider>
          ),
        },
      );

      const { dispatch } = result.current.tambo;

      // Add message with component
      dispatch({
        type: "APPEND_MESSAGE",
        threadId: result.current.tambo.currentThreadId,
        message: {
          id: "msg-1",
          role: "assistant",
          content: [
            {
              type: "component",
              id: "comp-1",
              name: "TestCard",
              props: { title: "Test", content: "Content" },
              streamingState: "complete",
            },
          ],
          createdAt: new Date().toISOString(),
        },
      });

      await waitFor(() => {
        expect(result.current.interactable.interactableComponents.length).toBe(
          1,
        );
      });

      // Trigger re-processing by updating thread state
      // (this simulates what might happen with state updates)
      dispatch({
        type: "APPEND_MESSAGE",
        threadId: result.current.tambo.currentThreadId,
        message: {
          id: "msg-2",
          role: "user",
          content: [{ type: "text", text: "Hello" }],
          createdAt: new Date().toISOString(),
        },
      });

      // Wait a bit
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });

      // Should still have only one interactable
      expect(result.current.interactable.interactableComponents).toHaveLength(
        1,
      );
    });

    it("should only process assistant messages, not user messages", async () => {
      const { result } = renderHook(
        () => ({
          tambo: useTambo(),
          interactable: useTamboInteractable(),
        }),
        {
          wrapper: ({ children }) => (
            <TamboProvider
              apiKey={mockApiKey}
              userKey="test-user"
              components={testComponents}
              autoAddInteractables={true}
            >
              {children}
            </TamboProvider>
          ),
        },
      );

      const { dispatch } = result.current.tambo;

      // Try to add a user message with a component (shouldn't happen in practice)
      dispatch({
        type: "APPEND_MESSAGE",
        threadId: result.current.tambo.currentThreadId,
        message: {
          id: "msg-1",
          role: "user",
          content: [
            {
              type: "component",
              id: "comp-1",
              name: "TestCard",
              props: { title: "Test", content: "Content" },
              streamingState: "complete",
            },
          ],
          createdAt: new Date().toISOString(),
        },
      });

      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });

      // Should not add user message components
      expect(result.current.interactable.interactableComponents).toHaveLength(
        0,
      );
    });

    it("should handle components that are not in the registry gracefully", async () => {
      const { result } = renderHook(
        () => ({
          tambo: useTambo(),
          interactable: useTamboInteractable(),
        }),
        {
          wrapper: ({ children }) => (
            <TamboProvider
              apiKey={mockApiKey}
              userKey="test-user"
              components={testComponents}
              autoAddInteractables={true}
            >
              {children}
            </TamboProvider>
          ),
        },
      );

      const { dispatch } = result.current.tambo;

      // Spy on console.warn
      const warnSpy = jest.spyOn(console, "warn").mockImplementation();

      dispatch({
        type: "APPEND_MESSAGE",
        threadId: result.current.tambo.currentThreadId,
        message: {
          id: "msg-1",
          role: "assistant",
          content: [
            {
              type: "component",
              id: "comp-1",
              name: "NonExistentComponent",
              props: {},
              streamingState: "complete",
            },
          ],
          createdAt: new Date().toISOString(),
        },
      });

      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });

      // Should not crash, should log warning
      expect(warnSpy).toHaveBeenCalled();
      expect(result.current.interactable.interactableComponents).toHaveLength(
        0,
      );

      warnSpy.mockRestore();
    });
  });
});
