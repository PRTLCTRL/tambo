import { render } from "@testing-library/react";
import React from "react";
import { z } from "zod";
import { TamboInteractableProvider } from "../../providers/tambo-interactable-provider";
import { TamboRegistryProvider } from "../../providers/tambo-registry-provider";
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

jest.mock("../../context-helpers/current-interactables-context-helper", () => ({
  createInteractablesContextHelper: () =>
    jest.fn(() => ({
      name: "interactables",
      context: {
        description: "Test interactables context",
        components: [],
      },
    })),
}));

const TestComponent: React.FC<{ title: string; count: number }> = ({
  title,
  count,
}) => (
  <div>
    <h1>{title}</h1>
    <span>{count}</span>
  </div>
);

describe("ComponentRenderer - Auto-add to Interactables", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should auto-add component to interactables when autoAddToInteractables is true", () => {
    const content: TamboComponentContent = {
      type: "component",
      id: "test-component-1",
      name: "TestComponent",
      props: { title: "Test Title", count: 5 },
      streamingState: "complete",
    };

    const { container } = render(
      <TamboRegistryProvider
        components={[
          {
            name: "TestComponent",
            description: "A test component",
            component: TestComponent,
            propsSchema: z.object({
              title: z.string(),
              count: z.number(),
            }),
          },
        ]}
      >
        <TamboInteractableProvider autoAddToInteractables={true}>
          <ComponentRenderer
            content={content}
            threadId="thread-1"
            messageId="message-1"
          />
        </TamboInteractableProvider>
      </TamboRegistryProvider>,
    );

    expect(container.querySelector("h1")?.textContent).toBe("Test Title");
    expect(container.querySelector("span")?.textContent).toBe("5");
  });

  it("should not auto-add component to interactables when autoAddToInteractables is false", () => {
    const content: TamboComponentContent = {
      type: "component",
      id: "test-component-2",
      name: "TestComponent",
      props: { title: "Test Title", count: 10 },
      streamingState: "complete",
    };

    const { container } = render(
      <TamboRegistryProvider
        components={[
          {
            name: "TestComponent",
            description: "A test component",
            component: TestComponent,
            propsSchema: z.object({
              title: z.string(),
              count: z.number(),
            }),
          },
        ]}
      >
        <TamboInteractableProvider autoAddToInteractables={false}>
          <ComponentRenderer
            content={content}
            threadId="thread-1"
            messageId="message-1"
          />
        </TamboInteractableProvider>
      </TamboRegistryProvider>,
    );

    expect(container.querySelector("h1")?.textContent).toBe("Test Title");
    expect(container.querySelector("span")?.textContent).toBe("10");
  });
});
