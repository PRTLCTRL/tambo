import React from "react";
import { render, waitFor } from "@testing-library/react";
import { z } from "zod";
import { ComponentRenderer } from "./v1-component-renderer";
import { TamboRegistryContext } from "../../providers/tambo-registry-provider";
import type { TamboRegistryContext as TamboRegistryContextType } from "../../providers/tambo-registry-provider";
import { TamboInteractableProvider } from "../../providers/tambo-interactable-provider";
import {
  TamboConfigContext,
  type TamboConfig,
} from "../providers/tambo-v1-provider";
import type { TamboComponentContent } from "../types/message";

const TestComponent: React.FC<{ title: string; count?: number }> = ({
  title,
  count,
}) => (
  <div data-testid="test-component">
    <span data-testid="title">{title}</span>
    {count !== undefined && <span data-testid="count">{count}</span>}
  </div>
);

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

describe("ComponentRenderer with autoAddInteractables", () => {
  const baseContent: TamboComponentContent = {
    type: "component",
    id: "comp_auto_123",
    name: "TestComponent",
    props: { title: "Hello World", count: 42 },
    streamingState: "done",
  };

  it("automatically adds component to interactables when autoAddInteractables is true", async () => {
    const config: TamboConfig = {
      autoAddInteractables: true,
    };

    const registry = createMockRegistry({
      TestComponent: {
        name: "TestComponent",
        description: "A test component",
        component: TestComponent,
        props: z.object({
          title: z.string(),
          count: z.number().optional(),
        }),
        contextTools: [],
      },
    });

    let addedComponent: unknown = null;

    const InteractableCapture: React.FC<{ children: React.ReactNode }> = ({
      children,
    }) => {
      const { ComponentContentProvider } = require("../utils/component-renderer");
      return (
        <TamboInteractableProvider>
          <ComponentContentProvider
            componentId={baseContent.id}
            threadId="thread_123"
            messageId="msg_456"
            componentName={baseContent.name}
          >
            <div data-testid="capture-wrapper">{children}</div>
          </ComponentContentProvider>
        </TamboInteractableProvider>
      );
    };

    render(
      <TamboRegistryContext.Provider value={registry}>
        <TamboConfigContext.Provider value={config}>
          <InteractableCapture>
            <ComponentRenderer
              content={baseContent}
              threadId="thread_123"
              messageId="msg_456"
            />
          </InteractableCapture>
        </TamboConfigContext.Provider>
      </TamboRegistryContext.Provider>,
    );

    await waitFor(() => {
      const { useTamboInteractable } = require("../../providers/tambo-interactable-provider");
      const TestWrapper: React.FC = () => {
        const { interactableComponents } = useTamboInteractable();
        addedComponent = interactableComponents.find(
          (c) => c.name === "TestComponent",
        );
        return null;
      };

      render(
        <TamboRegistryContext.Provider value={registry}>
          <TamboConfigContext.Provider value={config}>
            <TamboInteractableProvider>
              <TestWrapper />
            </TamboInteractableProvider>
          </TamboConfigContext.Provider>
        </TamboRegistryContext.Provider>,
      );

      expect(addedComponent).toBeTruthy();
    });
  });

  it("does not add component to interactables when autoAddInteractables is false", () => {
    const config: TamboConfig = {
      autoAddInteractables: false,
    };

    const registry = createMockRegistry({
      TestComponent: {
        name: "TestComponent",
        description: "A test component",
        component: TestComponent,
        props: { type: "object" },
        contextTools: [],
      },
    });

    let interactableCount = 0;

    const InteractableCapture: React.FC<{ children: React.ReactNode }> = ({
      children,
    }) => {
      const { useTamboInteractable } = require("../../providers/tambo-interactable-provider");
      const { interactableComponents } = useTamboInteractable();
      interactableCount = interactableComponents.length;
      return children;
    };

    render(
      <TamboRegistryContext.Provider value={registry}>
        <TamboConfigContext.Provider value={config}>
          <TamboInteractableProvider>
            <InteractableCapture>
              <ComponentRenderer
                content={baseContent}
                threadId="thread_123"
                messageId="msg_456"
              />
            </InteractableCapture>
          </TamboInteractableProvider>
        </TamboConfigContext.Provider>
      </TamboRegistryContext.Provider>,
    );

    expect(interactableCount).toBe(0);
  });

  it("does not add component to interactables when autoAddInteractables is undefined (defaults to false)", () => {
    const config: TamboConfig = {};

    const registry = createMockRegistry({
      TestComponent: {
        name: "TestComponent",
        description: "A test component",
        component: TestComponent,
        props: { type: "object" },
        contextTools: [],
      },
    });

    let interactableCount = 0;

    const InteractableCapture: React.FC<{ children: React.ReactNode }> = ({
      children,
    }) => {
      const { useTamboInteractable } = require("../../providers/tambo-interactable-provider");
      const { interactableComponents } = useTamboInteractable();
      interactableCount = interactableComponents.length;
      return children;
    };

    render(
      <TamboRegistryContext.Provider value={registry}>
        <TamboConfigContext.Provider value={config}>
          <TamboInteractableProvider>
            <InteractableCapture>
              <ComponentRenderer
                content={baseContent}
                threadId="thread_123"
                messageId="msg_456"
              />
            </InteractableCapture>
          </TamboInteractableProvider>
        </TamboConfigContext.Provider>
      </TamboRegistryContext.Provider>,
    );

    expect(interactableCount).toBe(0);
  });
});
