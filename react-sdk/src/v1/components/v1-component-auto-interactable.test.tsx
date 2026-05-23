import React from "react";
import { render, screen } from "@testing-library/react";
import { z } from "zod";
import { ComponentRenderer } from "./v1-component-renderer";
import { TamboRegistryContext } from "../../providers/tambo-registry-provider";
import type { TamboRegistryContext as TamboRegistryContextType } from "../../providers/tambo-registry-provider";
import {
  TamboInteractableProvider,
  useTamboInteractable,
} from "../../providers/tambo-interactable-provider";
import type { TamboComponentContent } from "../types/message";

// Test component for auto-add tests
const AutoAddTestComponent: React.FC<{ title: string; value: number }> = ({
  title,
  value,
}) => (
  <div data-testid="auto-add-test">
    <span data-testid="title">{title}</span>
    <span data-testid="value">{value}</span>
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

describe("ComponentRenderer - Auto-add to interactables", () => {
  it("automatically adds component as interactable when autoAddComponentsToInteractables is enabled", () => {
    const registry = createMockRegistry({
      AutoAddTestComponent: {
        name: "AutoAddTestComponent",
        description: "A component for auto-add testing",
        component: AutoAddTestComponent,
        props: z.object({ title: z.string(), value: z.number() }),
        contextTools: [],
      },
    });

    const content: TamboComponentContent = {
      type: "component",
      id: "comp_auto_123",
      name: "AutoAddTestComponent",
      props: { title: "Test", value: 42 },
      streamingState: "done",
    };

    const InteractableChecker: React.FC = () => {
      const { interactableComponents } = useTamboInteractable();
      return (
        <div data-testid="interactable-count">
          {interactableComponents.length}
        </div>
      );
    };

    render(
      <TamboRegistryContext.Provider value={registry}>
        <TamboInteractableProvider autoAddComponentsToInteractables={true}>
          <ComponentRenderer
            content={content}
            threadId="thread_123"
            messageId="msg_456"
          />
          <InteractableChecker />
        </TamboInteractableProvider>
      </TamboRegistryContext.Provider>,
    );

    // Component should render
    expect(screen.getByTestId("auto-add-test")).toBeInTheDocument();
    expect(screen.getByTestId("title")).toHaveTextContent("Test");
    expect(screen.getByTestId("value")).toHaveTextContent("42");

    // Component should be added to interactables
    expect(screen.getByTestId("interactable-count")).toHaveTextContent("1");
  });

  it("does not add component to interactables when autoAddComponentsToInteractables is disabled", () => {
    const registry = createMockRegistry({
      AutoAddTestComponent: {
        name: "AutoAddTestComponent",
        description: "A component for auto-add testing",
        component: AutoAddTestComponent,
        props: z.object({ title: z.string(), value: z.number() }),
        contextTools: [],
      },
    });

    const content: TamboComponentContent = {
      type: "component",
      id: "comp_auto_234",
      name: "AutoAddTestComponent",
      props: { title: "Test", value: 42 },
      streamingState: "done",
    };

    const InteractableChecker: React.FC = () => {
      const { interactableComponents } = useTamboInteractable();
      return (
        <div data-testid="interactable-count">
          {interactableComponents.length}
        </div>
      );
    };

    render(
      <TamboRegistryContext.Provider value={registry}>
        <TamboInteractableProvider autoAddComponentsToInteractables={false}>
          <ComponentRenderer
            content={content}
            threadId="thread_123"
            messageId="msg_456"
          />
          <InteractableChecker />
        </TamboInteractableProvider>
      </TamboRegistryContext.Provider>,
    );

    // Component should render
    expect(screen.getByTestId("auto-add-test")).toBeInTheDocument();

    // Component should NOT be added to interactables
    expect(screen.getByTestId("interactable-count")).toHaveTextContent("0");
  });

  it("does not add the same component multiple times", () => {
    const registry = createMockRegistry({
      AutoAddTestComponent: {
        name: "AutoAddTestComponent",
        description: "A component for auto-add testing",
        component: AutoAddTestComponent,
        props: z.object({ title: z.string(), value: z.number() }),
        contextTools: [],
      },
    });

    const content: TamboComponentContent = {
      type: "component",
      id: "comp_auto_345",
      name: "AutoAddTestComponent",
      props: { title: "Test", value: 42 },
      streamingState: "done",
    };

    const InteractableChecker: React.FC = () => {
      const { interactableComponents } = useTamboInteractable();
      return (
        <div data-testid="interactable-count">
          {interactableComponents.length}
        </div>
      );
    };

    const { rerender } = render(
      <TamboRegistryContext.Provider value={registry}>
        <TamboInteractableProvider autoAddComponentsToInteractables={true}>
          <ComponentRenderer
            content={content}
            threadId="thread_123"
            messageId="msg_456"
          />
          <InteractableChecker />
        </TamboInteractableProvider>
      </TamboRegistryContext.Provider>,
    );

    // Component should be added to interactables once
    expect(screen.getByTestId("interactable-count")).toHaveTextContent("1");

    // Re-render with same content
    rerender(
      <TamboRegistryContext.Provider value={registry}>
        <TamboInteractableProvider autoAddComponentsToInteractables={true}>
          <ComponentRenderer
            content={content}
            threadId="thread_123"
            messageId="msg_456"
          />
          <InteractableChecker />
        </TamboInteractableProvider>
      </TamboRegistryContext.Provider>,
    );

    // Should still only have 1 interactable component
    expect(screen.getByTestId("interactable-count")).toHaveTextContent("1");
  });

  it("adds component with correct metadata", () => {
    const registry = createMockRegistry({
      AutoAddTestComponent: {
        name: "AutoAddTestComponent",
        description: "A component for auto-add testing",
        component: AutoAddTestComponent,
        props: z.object({ title: z.string(), value: z.number() }),
        contextTools: [],
      },
    });

    const content: TamboComponentContent = {
      type: "component",
      id: "comp_auto_456",
      name: "AutoAddTestComponent",
      props: { title: "Metadata Test", value: 99 },
      streamingState: "done",
    };

    const MetadataChecker: React.FC = () => {
      const { interactableComponents } = useTamboInteractable();
      const firstComponent = interactableComponents[0];
      if (!firstComponent) {
        return <div data-testid="no-component">No component</div>;
      }
      return (
        <div>
          <div data-testid="component-name">{firstComponent.name}</div>
          <div data-testid="component-description">
            {firstComponent.description}
          </div>
          <div data-testid="component-props">
            {JSON.stringify(firstComponent.props)}
          </div>
        </div>
      );
    };

    render(
      <TamboRegistryContext.Provider value={registry}>
        <TamboInteractableProvider autoAddComponentsToInteractables={true}>
          <ComponentRenderer
            content={content}
            threadId="thread_123"
            messageId="msg_456"
          />
          <MetadataChecker />
        </TamboInteractableProvider>
      </TamboRegistryContext.Provider>,
    );

    // Check metadata
    expect(screen.getByTestId("component-name")).toHaveTextContent(
      "AutoAddTestComponent",
    );
    expect(screen.getByTestId("component-description")).toHaveTextContent(
      "A component for auto-add testing",
    );
    expect(screen.getByTestId("component-props")).toHaveTextContent(
      '{"title":"Metadata Test","value":99}',
    );
  });
});
