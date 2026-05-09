import { render } from "@testing-library/react";
import React from "react";
import { z } from "zod";
import { TamboRegistryProvider } from "../../providers/tambo-registry-provider";
import { TamboConfigContext } from "../providers/tambo-v1-provider";
import type { TamboComponentContent } from "../types/message";
import { ComponentRenderer } from "./v1-component-renderer";

const mockAddContextHelper = jest.fn();
const mockRemoveContextHelper = jest.fn();
const mockAddInteractableComponent = jest.fn();

jest.mock("../../providers/tambo-context-helpers-provider", () => ({
  TamboContextHelpersProvider: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <>{children}</>,
  useTamboContextHelpers: () => ({
    addContextHelper: mockAddContextHelper,
    removeContextHelper: mockRemoveContextHelper,
  }),
}));

jest.mock("../../providers/tambo-interactable-provider", () => ({
  TamboInteractableProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useTamboInteractable: () => ({
    addInteractableComponent: mockAddInteractableComponent,
    removeInteractableComponent: jest.fn(),
    interactableComponents: [],
  }),
}));

const TestComponent = ({ message }: { message: string }) => (
  <div>{message}</div>
);

describe("ComponentRenderer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders component normally without auto-add when setting is disabled", () => {
    const content: TamboComponentContent = {
      type: "component",
      id: "test-component-1",
      name: "TestComponent",
      props: { message: "Hello World" },
      streamingState: "done",
    };

    const { getByText } = render(
      <TamboConfigContext.Provider
        value={{ autoAddComponentsToInteractables: false }}
      >
        <TamboRegistryProvider
          components={[
            {
              name: "TestComponent",
              description: "A test component",
              component: TestComponent,
              propsSchema: z.object({ message: z.string() }),
            },
          ]}
        >
          <ComponentRenderer
            content={content}
            threadId="thread-1"
            messageId="msg-1"
          />
        </TamboRegistryProvider>
      </TamboConfigContext.Provider>,
    );

    expect(getByText("Hello World")).toBeInTheDocument();
    expect(mockAddInteractableComponent).not.toHaveBeenCalled();
  });

  it("renders component normally without auto-add when setting is undefined", () => {
    const content: TamboComponentContent = {
      type: "component",
      id: "test-component-2",
      name: "TestComponent",
      props: { message: "Hello Again" },
      streamingState: "done",
    };

    const { getByText } = render(
      <TamboConfigContext.Provider value={{}}>
        <TamboRegistryProvider
          components={[
            {
              name: "TestComponent",
              description: "A test component",
              component: TestComponent,
              propsSchema: z.object({ message: z.string() }),
            },
          ]}
        >
          <ComponentRenderer
            content={content}
            threadId="thread-2"
            messageId="msg-2"
          />
        </TamboRegistryProvider>
      </TamboConfigContext.Provider>,
    );

    expect(getByText("Hello Again")).toBeInTheDocument();
    expect(mockAddInteractableComponent).not.toHaveBeenCalled();
  });

  it("automatically adds component to interactables when setting is enabled", () => {
    const content: TamboComponentContent = {
      type: "component",
      id: "test-component-3",
      name: "TestComponent",
      props: { message: "Auto-add test" },
      streamingState: "done",
    };

    const { getByText } = render(
      <TamboConfigContext.Provider
        value={{ autoAddComponentsToInteractables: true }}
      >
        <TamboRegistryProvider
          components={[
            {
              name: "TestComponent",
              description: "A test component",
              component: TestComponent,
              propsSchema: z.object({ message: z.string() }),
            },
          ]}
        >
          <ComponentRenderer
            content={content}
            threadId="thread-3"
            messageId="msg-3"
          />
        </TamboRegistryProvider>
      </TamboConfigContext.Provider>,
    );

    expect(getByText("Auto-add test")).toBeInTheDocument();
    expect(mockAddInteractableComponent).toHaveBeenCalledWith({
      name: "TestComponent",
      description: "A test component",
      component: TestComponent,
      props: { message: "Auto-add test" },
      propsSchema: expect.any(Object),
    });
  });

  it("handles errors gracefully when auto-add fails", () => {
    const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();
    mockAddInteractableComponent.mockImplementationOnce(() => {
      throw new Error("Test error");
    });

    const content: TamboComponentContent = {
      type: "component",
      id: "test-component-4",
      name: "TestComponent",
      props: { message: "Error test" },
      streamingState: "done",
    };

    const { getByText } = render(
      <TamboConfigContext.Provider
        value={{ autoAddComponentsToInteractables: true }}
      >
        <TamboRegistryProvider
          components={[
            {
              name: "TestComponent",
              description: "A test component",
              component: TestComponent,
              propsSchema: z.object({ message: z.string() }),
            },
          ]}
        >
          <ComponentRenderer
            content={content}
            threadId="thread-4"
            messageId="msg-4"
          />
        </TamboRegistryProvider>
      </TamboConfigContext.Provider>,
    );

    expect(getByText("Error test")).toBeInTheDocument();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "[ComponentRenderer] Failed to add component TestComponent to interactables:",
      expect.any(Error),
    );

    consoleWarnSpy.mockRestore();
  });

  it("does not auto-add component when element is null", () => {
    const content: TamboComponentContent = {
      type: "component",
      id: "test-component-5",
      name: "NonExistentComponent",
      props: {},
      streamingState: "done",
    };

    render(
      <TamboConfigContext.Provider
        value={{ autoAddComponentsToInteractables: true }}
      >
        <TamboRegistryProvider components={[]}>
          <ComponentRenderer
            content={content}
            threadId="thread-5"
            messageId="msg-5"
          />
        </TamboRegistryProvider>
      </TamboConfigContext.Provider>,
    );

    expect(mockAddInteractableComponent).not.toHaveBeenCalled();
  });

  it("does not auto-add component multiple times on re-render", () => {
    const content: TamboComponentContent = {
      type: "component",
      id: "test-component-6",
      name: "TestComponent",
      props: { message: "Rerender test" },
      streamingState: "done",
    };

    const { rerender } = render(
      <TamboConfigContext.Provider
        value={{ autoAddComponentsToInteractables: true }}
      >
        <TamboRegistryProvider
          components={[
            {
              name: "TestComponent",
              description: "A test component",
              component: TestComponent,
              propsSchema: z.object({ message: z.string() }),
            },
          ]}
        >
          <ComponentRenderer
            content={content}
            threadId="thread-6"
            messageId="msg-6"
          />
        </TamboRegistryProvider>
      </TamboConfigContext.Provider>,
    );

    expect(mockAddInteractableComponent).toHaveBeenCalledTimes(1);

    rerender(
      <TamboConfigContext.Provider
        value={{ autoAddComponentsToInteractables: true }}
      >
        <TamboRegistryProvider
          components={[
            {
              name: "TestComponent",
              description: "A test component",
              component: TestComponent,
              propsSchema: z.object({ message: z.string() }),
            },
          ]}
        >
          <ComponentRenderer
            content={content}
            threadId="thread-6"
            messageId="msg-6"
          />
        </TamboRegistryProvider>
      </TamboConfigContext.Provider>,
    );

    expect(mockAddInteractableComponent).toHaveBeenCalledTimes(1);
  });
});
