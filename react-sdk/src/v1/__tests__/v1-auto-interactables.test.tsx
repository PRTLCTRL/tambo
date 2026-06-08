import { act, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { z } from "zod/v3";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import { TamboProvider } from "../providers/tambo-v1-provider";
import { ComponentRenderer } from "../components/v1-component-renderer";
import type { TamboComponentContent } from "../types/message";
import { TamboComponent } from "../../model/component-metadata";

const TestComponent: React.FC<{ title: string; content: string }> = ({
  title,
  content,
}) => {
  return (
    <div data-testid="test-component">
      <h1>{title}</h1>
      <p>{content}</p>
    </div>
  );
};

const testComponentMeta: TamboComponent = {
  name: "TestComponent",
  description: "A test component",
  component: TestComponent,
  propsSchema: z.object({
    title: z.string(),
    content: z.string(),
  }),
};

describe("Auto-register interactables", () => {
  it("should automatically register generated components when autoRegisterInteractables is true", async () => {
    const componentContent: TamboComponentContent = {
      type: "component",
      id: "test-component-1",
      name: "TestComponent",
      props: {
        title: "Test Title",
        content: "Test Content",
      },
    };

    let interactables: ReturnType<typeof useTamboInteractable> | null = null;

    function InteractableChecker() {
      interactables = useTamboInteractable();
      return null;
    }

    render(
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={[testComponentMeta]}
        autoRegisterInteractables={true}
      >
        <InteractableChecker />
        <ComponentRenderer
          content={componentContent}
          threadId="test-thread"
          messageId="test-message"
        />
      </TamboProvider>,
    );

    await waitFor(() => {
      expect(interactables?.interactableComponents.length).toBeGreaterThan(0);
    });

    expect(interactables?.interactableComponents).toHaveLength(1);
    expect(interactables?.interactableComponents[0].name).toBe("TestComponent");
    expect(interactables?.interactableComponents[0].props).toEqual({
      title: "Test Title",
      content: "Test Content",
    });
  });

  it("should NOT register components when autoRegisterInteractables is false", async () => {
    const componentContent: TamboComponentContent = {
      type: "component",
      id: "test-component-2",
      name: "TestComponent",
      props: {
        title: "Test Title",
        content: "Test Content",
      },
    };

    let interactables: ReturnType<typeof useTamboInteractable> | null = null;

    function InteractableChecker() {
      interactables = useTamboInteractable();
      return null;
    }

    render(
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={[testComponentMeta]}
        autoRegisterInteractables={false}
      >
        <InteractableChecker />
        <ComponentRenderer
          content={componentContent}
          threadId="test-thread"
          messageId="test-message"
        />
      </TamboProvider>,
    );

    // Wait a bit to ensure no registration happens
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(interactables?.interactableComponents).toHaveLength(0);
  });

  it("should NOT register components when autoRegisterInteractables is undefined (defaults to false)", async () => {
    const componentContent: TamboComponentContent = {
      type: "component",
      id: "test-component-3",
      name: "TestComponent",
      props: {
        title: "Test Title",
        content: "Test Content",
      },
    };

    let interactables: ReturnType<typeof useTamboInteractable> | null = null;

    function InteractableChecker() {
      interactables = useTamboInteractable();
      return null;
    }

    render(
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={[testComponentMeta]}
      >
        <InteractableChecker />
        <ComponentRenderer
          content={componentContent}
          threadId="test-thread"
          messageId="test-message"
        />
      </TamboProvider>,
    );

    // Wait a bit to ensure no registration happens
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(interactables?.interactableComponents).toHaveLength(0);
  });

  it("should register multiple components", async () => {
    let interactables: ReturnType<typeof useTamboInteractable> | null = null;

    function InteractableChecker() {
      interactables = useTamboInteractable();
      return null;
    }

    const component1: TamboComponentContent = {
      type: "component",
      id: "test-component-4",
      name: "TestComponent",
      props: {
        title: "First",
        content: "Content 1",
      },
    };

    const component2: TamboComponentContent = {
      type: "component",
      id: "test-component-5",
      name: "TestComponent",
      props: {
        title: "Second",
        content: "Content 2",
      },
    };

    render(
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={[testComponentMeta]}
        autoRegisterInteractables={true}
      >
        <InteractableChecker />
        <ComponentRenderer
          content={component1}
          threadId="test-thread"
          messageId="test-message-1"
        />
        <ComponentRenderer
          content={component2}
          threadId="test-thread"
          messageId="test-message-2"
        />
      </TamboProvider>,
    );

    await waitFor(() => {
      expect(interactables?.interactableComponents.length).toBe(2);
    });

    expect(interactables?.interactableComponents[0].props.title).toBe("First");
    expect(interactables?.interactableComponents[1].props.title).toBe("Second");
  });

  it("should not re-register the same component ID twice", async () => {
    let interactables: ReturnType<typeof useTamboInteractable> | null = null;

    function InteractableChecker() {
      interactables = useTamboInteractable();
      return null;
    }

    const componentContent: TamboComponentContent = {
      type: "component",
      id: "test-component-6",
      name: "TestComponent",
      props: {
        title: "Test Title",
        content: "Test Content",
      },
    };

    const { rerender } = render(
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={[testComponentMeta]}
        autoRegisterInteractables={true}
      >
        <InteractableChecker />
        <ComponentRenderer
          content={componentContent}
          threadId="test-thread"
          messageId="test-message"
        />
      </TamboProvider>,
    );

    await waitFor(() => {
      expect(interactables?.interactableComponents.length).toBe(1);
    });

    // Re-render with the same component
    rerender(
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={[testComponentMeta]}
        autoRegisterInteractables={true}
      >
        <InteractableChecker />
        <ComponentRenderer
          content={componentContent}
          threadId="test-thread"
          messageId="test-message"
        />
      </TamboProvider>,
    );

    // Should still only have 1 component registered
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(interactables?.interactableComponents).toHaveLength(1);
  });
});
