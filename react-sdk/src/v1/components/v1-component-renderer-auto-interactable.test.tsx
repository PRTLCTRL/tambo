import React from "react";
import { render, waitFor } from "@testing-library/react";
import { z } from "zod";
import { ComponentRenderer } from "./v1-component-renderer";
import { TamboRegistryContext } from "../../providers/tambo-registry-provider";
import type { TamboRegistryContext as TamboRegistryContextType } from "../../providers/tambo-registry-provider";
import { TamboInteractableProvider } from "../../providers/tambo-interactable-provider";
import { TamboConfigContext } from "../providers/tambo-v1-provider";
import type { TamboConfig } from "../providers/tambo-v1-provider";
import type { TamboComponentContent } from "../types/message";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";

// Simple test component
const TestCard: React.FC<{ title: string; content: string }> = ({
  title,
  content,
}) => (
  <div data-testid="test-card">
    <h2 data-testid="card-title">{title}</h2>
    <p data-testid="card-content">{content}</p>
  </div>
);

const testCardSchema = z.object({
  title: z.string(),
  content: z.string(),
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

// Helper component to capture interactable state
const InteractableCapture: React.FC<{
  onUpdate: (count: number) => void;
}> = ({ onUpdate }) => {
  const { interactableComponents } = useTamboInteractable();

  React.useEffect(() => {
    onUpdate(interactableComponents.length);
  }, [interactableComponents, onUpdate]);

  return null;
};

describe("ComponentRenderer - Auto Interactable", () => {
  const baseContent: TamboComponentContent = {
    type: "component",
    id: "card_123",
    name: "TestCard",
    props: { title: "Test Title", content: "Test Content" },
    streamingState: "done",
  };

  const registry = createMockRegistry({
    TestCard: {
      name: "TestCard",
      description: "A test card component",
      component: TestCard,
      props: testCardSchema,
      contextTools: [],
    },
  });

  it("automatically adds component to interactables when autoInteractable is true", async () => {
    const config: TamboConfig = {
      autoInteractable: true,
    };

    const interactableCounts: number[] = [];

    render(
      <TamboConfigContext.Provider value={config}>
        <TamboRegistryContext.Provider value={registry}>
          <TamboInteractableProvider>
            <InteractableCapture
              onUpdate={(count) => interactableCounts.push(count)}
            />
            <ComponentRenderer
              content={baseContent}
              threadId="thread_123"
              messageId="msg_456"
            />
          </TamboInteractableProvider>
        </TamboRegistryContext.Provider>
      </TamboConfigContext.Provider>,
    );

    await waitFor(() => {
      expect(interactableCounts.length).toBeGreaterThan(0);
      expect(interactableCounts[interactableCounts.length - 1]).toBe(1);
    });
  });

  it("does not add component to interactables when autoInteractable is false", async () => {
    const config: TamboConfig = {
      autoInteractable: false,
    };

    const interactableCounts: number[] = [];

    render(
      <TamboConfigContext.Provider value={config}>
        <TamboRegistryContext.Provider value={registry}>
          <TamboInteractableProvider>
            <InteractableCapture
              onUpdate={(count) => interactableCounts.push(count)}
            />
            <ComponentRenderer
              content={baseContent}
              threadId="thread_123"
              messageId="msg_456"
            />
          </TamboInteractableProvider>
        </TamboRegistryContext.Provider>
      </TamboConfigContext.Provider>,
    );

    await waitFor(() => {
      expect(interactableCounts.every((count) => count === 0)).toBe(true);
    });
  });

  it("does not add component to interactables when autoInteractable is undefined", async () => {
    const config: TamboConfig = {};

    const interactableCounts: number[] = [];

    render(
      <TamboConfigContext.Provider value={config}>
        <TamboRegistryContext.Provider value={registry}>
          <TamboInteractableProvider>
            <InteractableCapture
              onUpdate={(count) => interactableCounts.push(count)}
            />
            <ComponentRenderer
              content={baseContent}
              threadId="thread_123"
              messageId="msg_456"
            />
          </TamboInteractableProvider>
        </TamboRegistryContext.Provider>
      </TamboConfigContext.Provider>,
    );

    await waitFor(() => {
      expect(interactableCounts.every((count) => count === 0)).toBe(true);
    });
  });

  it("removes component from interactables on unmount", async () => {
    const config: TamboConfig = {
      autoInteractable: true,
    };

    const interactableCounts: number[] = [];

    const { unmount } = render(
      <TamboConfigContext.Provider value={config}>
        <TamboRegistryContext.Provider value={registry}>
          <TamboInteractableProvider>
            <InteractableCapture
              onUpdate={(count) => interactableCounts.push(count)}
            />
            <ComponentRenderer
              content={baseContent}
              threadId="thread_123"
              messageId="msg_456"
            />
          </TamboInteractableProvider>
        </TamboRegistryContext.Provider>
      </TamboConfigContext.Provider>,
    );

    await waitFor(() => {
      expect(interactableCounts[interactableCounts.length - 1]).toBe(1);
    });

    unmount();

    await waitFor(() => {
      expect(interactableCounts[interactableCounts.length - 1]).toBe(0);
    });
  });

  it("handles multiple auto-interactable components", async () => {
    const config: TamboConfig = {
      autoInteractable: true,
    };

    const content1: TamboComponentContent = {
      type: "component",
      id: "card_1",
      name: "TestCard",
      props: { title: "Card 1", content: "Content 1" },
      streamingState: "done",
    };

    const content2: TamboComponentContent = {
      type: "component",
      id: "card_2",
      name: "TestCard",
      props: { title: "Card 2", content: "Content 2" },
      streamingState: "done",
    };

    const interactableCounts: number[] = [];

    render(
      <TamboConfigContext.Provider value={config}>
        <TamboRegistryContext.Provider value={registry}>
          <TamboInteractableProvider>
            <InteractableCapture
              onUpdate={(count) => interactableCounts.push(count)}
            />
            <ComponentRenderer
              content={content1}
              threadId="thread_123"
              messageId="msg_456"
            />
            <ComponentRenderer
              content={content2}
              threadId="thread_123"
              messageId="msg_456"
            />
          </TamboInteractableProvider>
        </TamboRegistryContext.Provider>
      </TamboConfigContext.Provider>,
    );

    await waitFor(() => {
      expect(interactableCounts[interactableCounts.length - 1]).toBe(2);
    });
  });

  it("handles invalid component gracefully", async () => {
    const config: TamboConfig = {
      autoInteractable: true,
    };

    const invalidContent: TamboComponentContent = {
      type: "component",
      id: "invalid_123",
      name: "NonExistentComponent",
      props: {},
      streamingState: "done",
    };

    const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();

    render(
      <TamboConfigContext.Provider value={config}>
        <TamboRegistryContext.Provider value={registry}>
          <TamboInteractableProvider>
            <ComponentRenderer
              content={invalidContent}
              threadId="thread_123"
              messageId="msg_456"
            />
          </TamboInteractableProvider>
        </TamboRegistryContext.Provider>
      </TamboConfigContext.Provider>,
    );

    await waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to auto-register"),
        expect.any(Object),
      );
    });

    consoleWarnSpy.mockRestore();
  });
});
