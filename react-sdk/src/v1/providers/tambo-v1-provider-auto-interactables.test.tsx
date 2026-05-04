import React from "react";
import { render, screen } from "@testing-library/react";
import { TamboProvider } from "./tambo-v1-provider";
import { ComponentRenderer } from "../components/v1-component-renderer";
import type { TamboComponent } from "../../model/component-metadata";
import type { TamboComponentContent } from "../types/message";
import { z } from "zod/v3";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";

const TestComponent: React.FC<{ title: string; content: string }> = ({
  title,
  content,
}) => (
  <div>
    <h1>{title}</h1>
    <p>{content}</p>
  </div>
);

const testComponent: TamboComponent = {
  name: "TestComponent",
  description: "A test component for auto-interactables",
  component: TestComponent,
  propsSchema: z.object({
    title: z.string(),
    content: z.string(),
  }),
};

const InteractableObserver: React.FC<{
  onInteractablesChange: (count: number) => void;
}> = ({ onInteractablesChange }) => {
  const { interactableComponents } = useTamboInteractable();

  React.useEffect(() => {
    onInteractablesChange(interactableComponents.length);
  }, [interactableComponents, onInteractablesChange]);

  return null;
};

describe("TamboProvider autoAddComponentsToInteractables", () => {
  it("should NOT add components to interactables when autoAddComponentsToInteractables is false", () => {
    let interactableCount = 0;
    const onInteractablesChange = jest.fn((count) => {
      interactableCount = count;
    });

    const content: TamboComponentContent = {
      id: "comp-1",
      type: "component",
      name: "TestComponent",
      props: { title: "Test", content: "Content" },
    };

    render(
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={[testComponent]}
        autoAddComponentsToInteractables={false}
      >
        <InteractableObserver onInteractablesChange={onInteractablesChange} />
        <ComponentRenderer
          content={content}
          threadId="thread-1"
          messageId="msg-1"
        />
      </TamboProvider>,
    );

    expect(screen.getByText("Test")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
    expect(interactableCount).toBe(0);
  });

  it("should NOT add components to interactables when autoAddComponentsToInteractables is undefined", () => {
    let interactableCount = 0;
    const onInteractablesChange = jest.fn((count) => {
      interactableCount = count;
    });

    const content: TamboComponentContent = {
      id: "comp-1",
      type: "component",
      name: "TestComponent",
      props: { title: "Test", content: "Content" },
    };

    render(
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={[testComponent]}
      >
        <InteractableObserver onInteractablesChange={onInteractablesChange} />
        <ComponentRenderer
          content={content}
          threadId="thread-1"
          messageId="msg-1"
        />
      </TamboProvider>,
    );

    expect(screen.getByText("Test")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
    expect(interactableCount).toBe(0);
  });

  it("should add components to interactables when autoAddComponentsToInteractables is true", () => {
    let interactableCount = 0;
    const onInteractablesChange = jest.fn((count) => {
      interactableCount = count;
    });

    const content: TamboComponentContent = {
      id: "comp-1",
      type: "component",
      name: "TestComponent",
      props: { title: "Test", content: "Content" },
    };

    render(
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={[testComponent]}
        autoAddComponentsToInteractables={true}
      >
        <InteractableObserver onInteractablesChange={onInteractablesChange} />
        <ComponentRenderer
          content={content}
          threadId="thread-1"
          messageId="msg-1"
        />
      </TamboProvider>,
    );

    expect(screen.getByText("Test")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
    expect(interactableCount).toBe(1);
  });

  it("should render component normally regardless of interactables setting", () => {
    const content: TamboComponentContent = {
      id: "comp-1",
      type: "component",
      name: "TestComponent",
      props: { title: "My Title", content: "My Content" },
    };

    render(
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={[testComponent]}
        autoAddComponentsToInteractables={true}
      >
        <ComponentRenderer
          content={content}
          threadId="thread-1"
          messageId="msg-1"
        />
      </TamboProvider>,
    );

    expect(screen.getByText("My Title")).toBeInTheDocument();
    expect(screen.getByText("My Content")).toBeInTheDocument();
  });
});
