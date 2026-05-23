import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { TamboProvider } from "../providers/tambo-v1-provider";
import { ComponentRenderer } from "./v1-component-renderer";
import type { TamboComponentContent } from "../types/message";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";

const TestComponent: React.FC<{ text: string }> = ({ text }) => {
  return <div data-testid="test-component">{text}</div>;
};

describe("ComponentRenderer - Auto Interactables", () => {
  const mockApiKey = "test-api-key";
  const mockUserKey = "test-user";

  const createTestContent = (id: string): TamboComponentContent => ({
    type: "component",
    id,
    name: "TestComponent",
    props: { text: "Hello World" },
  });

  it("should not add component to interactables when autoAddGeneratedComponentsToInteractables is false", async () => {
    let interactableCount = 0;

    function InteractableChecker() {
      const { interactableComponents } = useTamboInteractable();
      interactableCount = interactableComponents.length;
      return null;
    }

    render(
      <TamboProvider
        apiKey={mockApiKey}
        userKey={mockUserKey}
        components={[
          {
            name: "TestComponent",
            description: "A test component",
            component: TestComponent,
          },
        ]}
        autoAddGeneratedComponentsToInteractables={false}
      >
        <ComponentRenderer
          content={createTestContent("test-comp-1")}
          threadId="thread-1"
          messageId="msg-1"
        />
        <InteractableChecker />
      </TamboProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("test-component")).toBeInTheDocument();
    });

    expect(interactableCount).toBe(0);
  });

  it("should add component to interactables when autoAddGeneratedComponentsToInteractables is true", async () => {
    let interactableCount = 0;
    let addedInteractableId = "";

    function InteractableChecker() {
      const { interactableComponents } = useTamboInteractable();
      interactableCount = interactableComponents.length;
      if (interactableComponents.length > 0) {
        addedInteractableId = interactableComponents[0].id;
      }
      return null;
    }

    render(
      <TamboProvider
        apiKey={mockApiKey}
        userKey={mockUserKey}
        components={[
          {
            name: "TestComponent",
            description: "A test component",
            component: TestComponent,
          },
        ]}
        autoAddGeneratedComponentsToInteractables={true}
      >
        <ComponentRenderer
          content={createTestContent("test-comp-1")}
          threadId="thread-1"
          messageId="msg-1"
        />
        <InteractableChecker />
      </TamboProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("test-component")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(interactableCount).toBe(1);
    });

    expect(addedInteractableId).toBe("test-comp-1");
  });

  it("should not add the same component twice", async () => {
    let interactableCount = 0;

    function InteractableChecker() {
      const { interactableComponents } = useTamboInteractable();
      interactableCount = interactableComponents.length;
      return null;
    }

    const { rerender } = render(
      <TamboProvider
        apiKey={mockApiKey}
        userKey={mockUserKey}
        components={[
          {
            name: "TestComponent",
            description: "A test component",
            component: TestComponent,
          },
        ]}
        autoAddGeneratedComponentsToInteractables={true}
      >
        <ComponentRenderer
          content={createTestContent("test-comp-1")}
          threadId="thread-1"
          messageId="msg-1"
        />
        <InteractableChecker />
      </TamboProvider>,
    );

    await waitFor(() => {
      expect(interactableCount).toBe(1);
    });

    // Re-render the same component
    rerender(
      <TamboProvider
        apiKey={mockApiKey}
        userKey={mockUserKey}
        components={[
          {
            name: "TestComponent",
            description: "A test component",
            component: TestComponent,
          },
        ]}
        autoAddGeneratedComponentsToInteractables={true}
      >
        <ComponentRenderer
          content={createTestContent("test-comp-1")}
          threadId="thread-1"
          messageId="msg-1"
        />
        <InteractableChecker />
      </TamboProvider>,
    );

    // Still should only have 1 interactable
    expect(interactableCount).toBe(1);
  });

  it("should add multiple different components to interactables", async () => {
    let interactableCount = 0;

    function InteractableChecker() {
      const { interactableComponents } = useTamboInteractable();
      interactableCount = interactableComponents.length;
      return null;
    }

    render(
      <TamboProvider
        apiKey={mockApiKey}
        userKey={mockUserKey}
        components={[
          {
            name: "TestComponent",
            description: "A test component",
            component: TestComponent,
          },
        ]}
        autoAddGeneratedComponentsToInteractables={true}
      >
        <ComponentRenderer
          content={createTestContent("test-comp-1")}
          threadId="thread-1"
          messageId="msg-1"
        />
        <ComponentRenderer
          content={createTestContent("test-comp-2")}
          threadId="thread-1"
          messageId="msg-2"
        />
        <InteractableChecker />
      </TamboProvider>,
    );

    await waitFor(() => {
      expect(interactableCount).toBe(2);
    });
  });
});
