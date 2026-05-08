import { render } from "@testing-library/react";
import React from "react";
import { z } from "zod";
import { TamboRegistryProvider } from "../../providers/tambo-registry-provider";
import { TamboInteractableProvider } from "../../providers/tambo-interactable-provider";
import { TamboConfigContext } from "../providers/tambo-v1-provider";
import type { TamboComponentContent } from "../types/message";
import { ComponentRenderer } from "./v1-component-renderer";

const mockAddContextHelper = jest.fn();
const mockRemoveContextHelper = jest.fn();

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
          <TamboInteractableProvider>
            <ComponentRenderer
              content={content}
              threadId="thread-1"
              messageId="msg-1"
            />
          </TamboInteractableProvider>
        </TamboRegistryProvider>
      </TamboConfigContext.Provider>,
    );

    expect(getByText("Hello World")).toBeInTheDocument();
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
          <TamboInteractableProvider>
            <ComponentRenderer
              content={content}
              threadId="thread-2"
              messageId="msg-2"
            />
          </TamboInteractableProvider>
        </TamboRegistryProvider>
      </TamboConfigContext.Provider>,
    );

    expect(getByText("Hello Again")).toBeInTheDocument();
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
          <TamboInteractableProvider>
            <ComponentRenderer
              content={content}
              threadId="thread-3"
              messageId="msg-3"
            />
          </TamboInteractableProvider>
        </TamboRegistryProvider>
      </TamboConfigContext.Provider>,
    );

    expect(getByText("Auto-add test")).toBeInTheDocument();
  });
});
