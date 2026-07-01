import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { ComponentRenderer } from "./v1-component-renderer";
import { TamboRegistryContext } from "../../providers/tambo-registry-provider";
import type { TamboRegistryContext as TamboRegistryContextType } from "../../providers/tambo-registry-provider";
import type { TamboComponentContent } from "../types/message";

// Simple test component
const TestComponent: React.FC<{ title: string }> = ({ title }) => (
  <div data-testid="test-component">
    <span data-testid="title">{title}</span>
  </div>
);

// Mock TamboConfig hook
const mockUseTamboConfig = jest.fn();
jest.mock("../providers/tambo-v1-provider", () => ({
  ...jest.requireActual("../providers/tambo-v1-provider"),
  useTamboConfig: () => mockUseTamboConfig(),
}));

// Mock TamboInteractable hook
const mockAddInteractableComponent = jest.fn();
const mockGetInteractableComponentsByName = jest.fn();
jest.mock("../../providers/tambo-interactable-provider", () => ({
  ...jest.requireActual("../../providers/tambo-interactable-provider"),
  useTamboInteractable: () => ({
    interactableComponents: [],
    addInteractableComponent: mockAddInteractableComponent,
    removeInteractableComponent: jest.fn(),
    updateInteractableComponentProps: jest.fn(),
    getInteractableComponent: jest.fn(),
    getInteractableComponentsByName: mockGetInteractableComponentsByName,
    clearAllInteractableComponents: jest.fn(),
    setInteractableState: jest.fn(),
    getInteractableComponentState: jest.fn(),
    setInteractableSelected: jest.fn(),
    clearInteractableSelections: jest.fn(),
  }),
}));

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

describe("ComponentRenderer - Auto-register Interactables", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetInteractableComponentsByName.mockReturnValue([]);
  });

  const baseContent: TamboComponentContent = {
    type: "component",
    id: "comp_123",
    name: "TestComponent",
    props: { title: "Hello World" },
    streamingState: "complete",
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

  it("auto-registers component as interactable when flag is enabled and streaming is complete", async () => {
    mockUseTamboConfig.mockReturnValue({ autoRegisterInteractables: true });

    render(
      <TamboRegistryContext.Provider value={registry}>
        <ComponentRenderer
          content={baseContent}
          threadId="thread_123"
          messageId="msg_456"
        />
      </TamboRegistryContext.Provider>,
    );

    expect(screen.getByTestId("test-component")).toBeInTheDocument();

    await waitFor(() => {
      expect(mockAddInteractableComponent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "TestComponent",
          description: "A test component",
          component: TestComponent,
          props: { title: "Hello World" },
        }),
      );
    });
  });

  it("does not auto-register when flag is disabled", () => {
    mockUseTamboConfig.mockReturnValue({ autoRegisterInteractables: false });

    render(
      <TamboRegistryContext.Provider value={registry}>
        <ComponentRenderer
          content={baseContent}
          threadId="thread_123"
          messageId="msg_456"
        />
      </TamboRegistryContext.Provider>,
    );

    expect(screen.getByTestId("test-component")).toBeInTheDocument();
    expect(mockAddInteractableComponent).not.toHaveBeenCalled();
  });

  it("does not auto-register when flag is undefined (defaults to false)", () => {
    mockUseTamboConfig.mockReturnValue({});

    render(
      <TamboRegistryContext.Provider value={registry}>
        <ComponentRenderer
          content={baseContent}
          threadId="thread_123"
          messageId="msg_456"
        />
      </TamboRegistryContext.Provider>,
    );

    expect(screen.getByTestId("test-component")).toBeInTheDocument();
    expect(mockAddInteractableComponent).not.toHaveBeenCalled();
  });

  it("does not auto-register when component is still streaming", () => {
    mockUseTamboConfig.mockReturnValue({ autoRegisterInteractables: true });

    const streamingContent: TamboComponentContent = {
      ...baseContent,
      streamingState: "streaming",
    };

    render(
      <TamboRegistryContext.Provider value={registry}>
        <ComponentRenderer
          content={streamingContent}
          threadId="thread_123"
          messageId="msg_456"
        />
      </TamboRegistryContext.Provider>,
    );

    expect(screen.getByTestId("test-component")).toBeInTheDocument();
    expect(mockAddInteractableComponent).not.toHaveBeenCalled();
  });

  it("does not auto-register if component with same props already exists", () => {
    mockUseTamboConfig.mockReturnValue({ autoRegisterInteractables: true });

    const existingInteractable = {
      id: "existing_id",
      name: "TestComponent",
      props: { title: "Hello World" },
      state: {},
    };
    mockGetInteractableComponentsByName.mockReturnValue([
      existingInteractable,
    ]);

    render(
      <TamboRegistryContext.Provider value={registry}>
        <ComponentRenderer
          content={baseContent}
          threadId="thread_123"
          messageId="msg_456"
        />
      </TamboRegistryContext.Provider>,
    );

    expect(screen.getByTestId("test-component")).toBeInTheDocument();
    expect(mockAddInteractableComponent).not.toHaveBeenCalled();
  });

  it("auto-registers if component with same name but different props exists", async () => {
    mockUseTamboConfig.mockReturnValue({ autoRegisterInteractables: true });

    const existingInteractable = {
      id: "existing_id",
      name: "TestComponent",
      props: { title: "Different Title" },
      state: {},
    };
    mockGetInteractableComponentsByName.mockReturnValue([
      existingInteractable,
    ]);

    render(
      <TamboRegistryContext.Provider value={registry}>
        <ComponentRenderer
          content={baseContent}
          threadId="thread_123"
          messageId="msg_456"
        />
      </TamboRegistryContext.Provider>,
    );

    expect(screen.getByTestId("test-component")).toBeInTheDocument();

    await waitFor(() => {
      expect(mockAddInteractableComponent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "TestComponent",
          description: "A test component",
          component: TestComponent,
          props: { title: "Hello World" },
        }),
      );
    });
  });
});
