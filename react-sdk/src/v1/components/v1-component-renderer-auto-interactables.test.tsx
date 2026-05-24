import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { z } from "zod";
import type { RegisteredComponent } from "../../model/component-metadata";
import { TamboRegistryContext } from "../../providers/tambo-registry-provider";
import type { TamboComponentContent } from "../types/message";
import { TamboConfigContext } from "../providers/tambo-v1-provider";
import { ComponentRenderer } from "./v1-component-renderer";
import { TamboInteractableProvider } from "../../providers/tambo-interactable-provider";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";

const TestComponent = ({ title, content }: { title: string; content: string }) => (
  <div data-testid="test-component">
    <h1>{title}</h1>
    <p>{content}</p>
  </div>
);

const InteractablesDisplay = () => {
  const { interactableComponents } = useTamboInteractable();
  return (
    <div data-testid="interactables-count">
      {interactableComponents.length}
    </div>
  );
};

describe("ComponentRenderer - Auto Interactables", () => {
  const mockRegistry = {
    componentList: [
      {
        name: "TestComponent",
        description: "A test component for testing",
        component: TestComponent,
        props: z.object({
          title: z.string(),
          content: z.string(),
        }),
      },
    ] as RegisteredComponent[],
    toolList: [],
    mcpServers: [],
    resources: [],
    listResources: undefined,
    getResource: undefined,
    registerComponent: jest.fn(),
    registerTool: jest.fn(),
    unregisterTools: jest.fn(),
    registerMcpServer: jest.fn(),
    addResource: jest.fn(),
    removeResource: jest.fn(),
    registerResourceSource: jest.fn(),
  };

  const mockComponentContent: TamboComponentContent = {
    type: "component",
    id: "comp-123",
    name: "TestComponent",
    props: {
      title: "Test Title",
      content: "Test Content",
    },
    streamingState: "complete",
  };

  it("should automatically add component to interactables when autoAddInteractables is true", async () => {
    render(
      <TamboConfigContext.Provider
        value={{ autoAddInteractables: true }}
      >
        <TamboRegistryContext.Provider value={mockRegistry}>
          <TamboInteractableProvider>
            <ComponentRenderer
              content={mockComponentContent}
              threadId="thread-1"
              messageId="msg-1"
            />
            <InteractablesDisplay />
          </TamboInteractableProvider>
        </TamboRegistryContext.Provider>
      </TamboConfigContext.Provider>
    );

    // Component should render
    expect(screen.getByTestId("test-component")).toBeInTheDocument();
    expect(screen.getByText("Test Title")).toBeInTheDocument();

    // Should be added to interactables
    await waitFor(() => {
      expect(screen.getByTestId("interactables-count").textContent).toBe("1");
    });
  });

  it("should NOT add component to interactables when autoAddInteractables is false", async () => {
    render(
      <TamboConfigContext.Provider
        value={{ autoAddInteractables: false }}
      >
        <TamboRegistryContext.Provider value={mockRegistry}>
          <TamboInteractableProvider>
            <ComponentRenderer
              content={mockComponentContent}
              threadId="thread-1"
              messageId="msg-1"
            />
            <InteractablesDisplay />
          </TamboInteractableProvider>
        </TamboRegistryContext.Provider>
      </TamboConfigContext.Provider>
    );

    // Component should still render
    expect(screen.getByTestId("test-component")).toBeInTheDocument();

    // Should NOT be added to interactables
    await waitFor(() => {
      expect(screen.getByTestId("interactables-count").textContent).toBe("0");
    });
  });

  it("should NOT add component to interactables when autoAddInteractables is undefined", async () => {
    render(
      <TamboConfigContext.Provider
        value={{}}
      >
        <TamboRegistryContext.Provider value={mockRegistry}>
          <TamboInteractableProvider>
            <ComponentRenderer
              content={mockComponentContent}
              threadId="thread-1"
              messageId="msg-1"
            />
            <InteractablesDisplay />
          </TamboInteractableProvider>
        </TamboRegistryContext.Provider>
      </TamboConfigContext.Provider>
    );

    // Component should still render
    expect(screen.getByTestId("test-component")).toBeInTheDocument();

    // Should NOT be added to interactables (defaults to false)
    await waitFor(() => {
      expect(screen.getByTestId("interactables-count").textContent).toBe("0");
    });
  });

  it("should handle component not in registry gracefully", async () => {
    const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();

    const invalidContent: TamboComponentContent = {
      type: "component",
      id: "comp-456",
      name: "NonExistentComponent",
      props: {},
      streamingState: "complete",
    };

    render(
      <TamboConfigContext.Provider
        value={{ autoAddInteractables: true }}
      >
        <TamboRegistryContext.Provider value={mockRegistry}>
          <TamboInteractableProvider>
            <ComponentRenderer
              content={invalidContent}
              threadId="thread-1"
              messageId="msg-1"
              fallback={<div>Component not found</div>}
            />
            <InteractablesDisplay />
          </TamboInteractableProvider>
        </TamboRegistryContext.Provider>
      </TamboConfigContext.Provider>
    );

    // Should show fallback
    expect(screen.getByText("Component not found")).toBeInTheDocument();

    // Should warn about the issue
    await waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    // Should NOT add to interactables
    expect(screen.getByTestId("interactables-count").textContent).toBe("0");

    consoleWarnSpy.mockRestore();
  });

  it("should add multiple different components to interactables", async () => {
    const mockRegistryWithMultiple = {
      ...mockRegistry,
      componentList: [
        ...mockRegistry.componentList,
        {
          name: "SecondComponent",
          description: "Another test component",
          component: TestComponent,
          props: z.object({
            title: z.string(),
            content: z.string(),
          }),
        },
      ] as RegisteredComponent[],
    };

    const secondContent: TamboComponentContent = {
      type: "component",
      id: "comp-456",
      name: "SecondComponent",
      props: {
        title: "Second Title",
        content: "Second Content",
      },
      streamingState: "complete",
    };

    const { rerender } = render(
      <TamboConfigContext.Provider
        value={{ autoAddInteractables: true }}
      >
        <TamboRegistryContext.Provider value={mockRegistryWithMultiple}>
          <TamboInteractableProvider>
            <ComponentRenderer
              content={mockComponentContent}
              threadId="thread-1"
              messageId="msg-1"
            />
            <InteractablesDisplay />
          </TamboInteractableProvider>
        </TamboRegistryContext.Provider>
      </TamboConfigContext.Provider>
    );

    // First component added
    await waitFor(() => {
      expect(screen.getByTestId("interactables-count").textContent).toBe("1");
    });

    // Add second component
    rerender(
      <TamboConfigContext.Provider
        value={{ autoAddInteractables: true }}
      >
        <TamboRegistryContext.Provider value={mockRegistryWithMultiple}>
          <TamboInteractableProvider>
            <ComponentRenderer
              content={mockComponentContent}
              threadId="thread-1"
              messageId="msg-1"
            />
            <ComponentRenderer
              content={secondContent}
              threadId="thread-1"
              messageId="msg-2"
            />
            <InteractablesDisplay />
          </TamboInteractableProvider>
        </TamboRegistryContext.Provider>
      </TamboConfigContext.Provider>
    );

    // Both components should be added
    await waitFor(() => {
      expect(screen.getByTestId("interactables-count").textContent).toBe("2");
    });
  });
});
