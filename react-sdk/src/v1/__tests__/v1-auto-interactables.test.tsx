import React from "react";
import { render, waitFor } from "@testing-library/react";
import { z } from "zod";
import { ComponentRenderer } from "../components/v1-component-renderer";
import { TamboRegistryContext } from "../../providers/tambo-registry-provider";
import type { TamboRegistryContext as TamboRegistryContextType } from "../../providers/tambo-registry-provider";
import { TamboInteractableProvider } from "../../providers/tambo-interactable-provider";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import type { TamboComponentContent } from "../types/message";

// Test component
const TestCard: React.FC<{ title: string; description: string }> = ({
  title,
  description,
}) => (
  <div data-testid="test-card">
    <h2>{title}</h2>
    <p>{description}</p>
  </div>
);

const testCardSchema = z.object({
  title: z.string(),
  description: z.string(),
});

// Create a mock registry
function createMockRegistry(
  componentList: TamboRegistryContextType["componentList"] = {},
): TamboRegistryContextType {
  return {
    componentList,
    toolRegistry: {},
    componentToolAssociations: {},
    mcpServerInfos: [],
    resources: [],
    resourceSource: null,
    registerComponent: jest.fn(),
    registerTool: jest.fn(),
    registerTools: jest.fn(),
    unregisterTools: jest.fn(),
    addToolAssociation: jest.fn(),
    registerMcpServer: jest.fn(),
    registerMcpServers: jest.fn(),
    registerResource: jest.fn(),
    registerResources: jest.fn(),
    registerResourceSource: jest.fn(),
  };
}

// Test component that accesses the interactable context
const InteractableTestComponent: React.FC = () => {
  const { interactableComponents } = useTamboInteractable();
  return (
    <div data-testid="interactable-count">
      {interactableComponents.length}
    </div>
  );
};

describe("Auto Interactables", () => {
  const registry = createMockRegistry({
    TestCard: {
      name: "TestCard",
      description: "A test card component",
      component: TestCard,
      propsSchema: testCardSchema,
      props: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
        },
      },
      contextTools: [],
    },
  });

  const componentContent: TamboComponentContent = {
    type: "component",
    id: "card_123",
    name: "TestCard",
    props: {
      title: "Test Title",
      description: "Test description",
    },
    streamingState: "done",
  };

  it("should automatically add component to interactables when autoInteractables is enabled", async () => {
    const { rerender } = render(
      <TamboRegistryContext.Provider value={registry}>
        <TamboInteractableProvider autoInteractables={true}>
          <ComponentRenderer
            content={componentContent}
            threadId="thread_123"
            messageId="msg_456"
          />
          <InteractableTestComponent />
        </TamboInteractableProvider>
      </TamboRegistryContext.Provider>,
    );

    await waitFor(() => {
      const countElement = document.querySelector(
        '[data-testid="interactable-count"]',
      );
      expect(countElement?.textContent).toBe("1");
    });

    rerender(
      <TamboRegistryContext.Provider value={registry}>
        <TamboInteractableProvider autoInteractables={true}>
          <ComponentRenderer
            content={componentContent}
            threadId="thread_123"
            messageId="msg_456"
          />
          <InteractableTestComponent />
        </TamboInteractableProvider>
      </TamboRegistryContext.Provider>,
    );

    await waitFor(() => {
      const countElement = document.querySelector(
        '[data-testid="interactable-count"]',
      );
      expect(countElement?.textContent).toBe("1");
    });
  });

  it("should NOT add component to interactables when autoInteractables is disabled", async () => {
    render(
      <TamboRegistryContext.Provider value={registry}>
        <TamboInteractableProvider autoInteractables={false}>
          <ComponentRenderer
            content={componentContent}
            threadId="thread_123"
            messageId="msg_456"
          />
          <InteractableTestComponent />
        </TamboInteractableProvider>
      </TamboRegistryContext.Provider>,
    );

    await waitFor(() => {
      const countElement = document.querySelector(
        '[data-testid="interactable-count"]',
      );
      expect(countElement?.textContent).toBe("0");
    });
  });

  it("should NOT add component to interactables when streaming is not complete", async () => {
    const streamingContent: TamboComponentContent = {
      ...componentContent,
      streamingState: "streaming",
    };

    render(
      <TamboRegistryContext.Provider value={registry}>
        <TamboInteractableProvider autoInteractables={true}>
          <ComponentRenderer
            content={streamingContent}
            threadId="thread_123"
            messageId="msg_456"
          />
          <InteractableTestComponent />
        </TamboInteractableProvider>
      </TamboRegistryContext.Provider>,
    );

    await waitFor(() => {
      const countElement = document.querySelector(
        '[data-testid="interactable-count"]',
      );
      expect(countElement?.textContent).toBe("0");
    });
  });

  it("should add multiple unique components to interactables", async () => {
    const content1: TamboComponentContent = {
      type: "component",
      id: "card_123",
      name: "TestCard",
      props: {
        title: "Card 1",
        description: "First card",
      },
      streamingState: "done",
    };

    const content2: TamboComponentContent = {
      type: "component",
      id: "card_456",
      name: "TestCard",
      props: {
        title: "Card 2",
        description: "Second card",
      },
      streamingState: "done",
    };

    render(
      <TamboRegistryContext.Provider value={registry}>
        <TamboInteractableProvider autoInteractables={true}>
          <ComponentRenderer
            content={content1}
            threadId="thread_123"
            messageId="msg_456"
          />
          <ComponentRenderer
            content={content2}
            threadId="thread_123"
            messageId="msg_789"
          />
          <InteractableTestComponent />
        </TamboInteractableProvider>
      </TamboRegistryContext.Provider>,
    );

    await waitFor(() => {
      const countElement = document.querySelector(
        '[data-testid="interactable-count"]',
      );
      expect(countElement?.textContent).toBe("2");
    });
  });

  it("should handle missing component gracefully", async () => {
    const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();

    const unknownContent: TamboComponentContent = {
      type: "component",
      id: "unknown_123",
      name: "UnknownComponent",
      props: {},
      streamingState: "done",
    };

    render(
      <TamboRegistryContext.Provider value={registry}>
        <TamboInteractableProvider autoInteractables={true}>
          <ComponentRenderer
            content={unknownContent}
            threadId="thread_123"
            messageId="msg_456"
          />
          <InteractableTestComponent />
        </TamboInteractableProvider>
      </TamboRegistryContext.Provider>,
    );

    await waitFor(() => {
      const countElement = document.querySelector(
        '[data-testid="interactable-count"]',
      );
      expect(countElement?.textContent).toBe("0");
    });

    expect(consoleWarnSpy).toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });
});
