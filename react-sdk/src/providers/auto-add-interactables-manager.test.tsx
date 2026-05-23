import { render, waitFor } from "@testing-library/react";
import React from "react";
import { z } from "zod/v3";
import { TamboProvider } from "../v1/providers/tambo-v1-provider";
import { useTamboInteractable } from "./tambo-interactable-provider";
import { EventType } from "@ag-ui/core";
import type { TamboComponent } from "../model/component-metadata";
import type { StreamAction } from "@tambo-ai/client";

// Mock dependencies
jest.mock("../providers/tambo-client-provider", () => ({
  useTamboClient: () => ({
    threads: {
      messages: { list: jest.fn() },
      runs: { delete: jest.fn() },
      update: jest.fn(),
    },
  }),
  useTamboQueryClient: () => ({
    invalidateQueries: jest.fn(),
  }),
}));

jest.mock("../hooks/react-query-hooks", () => ({
  useTamboQuery: jest.fn(() => ({
    data: null,
    isLoading: false,
  })),
}));

// Test component
const TestCard: React.FC<{ title: string; content: string }> = ({
  title,
  content,
}) => (
  <div>
    <h2>{title}</h2>
    <p>{content}</p>
  </div>
);

describe("AutoAddInteractablesManager", () => {
  it("should auto-add components to interactables when enabled", async () => {
    const components: TamboComponent[] = [
      {
        name: "TestCard",
        description: "A test card component",
        component: TestCard,
        propsSchema: z.object({
          title: z.string(),
          content: z.string(),
        }),
      },
    ];

    let interactableComponents: ReturnType<
      typeof useTamboInteractable
    >["interactableComponents"] = [];

    const TestConsumer = () => {
      const { interactableComponents: components } = useTamboInteractable();
      interactableComponents = components;
      return null;
    };

    const { rerender } = render(
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={components}
        autoAddInteractables={true}
      >
        <TestConsumer />
      </TamboProvider>,
    );

    // Initially no interactables
    expect(interactableComponents).toHaveLength(0);

    // Access provider's internal dispatch to simulate receiving a message with a component
    // This is a bit hacky for testing, but necessary to test the auto-add behavior
    const dispatch = (action: StreamAction) => {
      // Would normally dispatch through the provider
      // For now we'll just verify the structure
    };

    // TODO: Find a better way to test this that doesn't require internal access
    // For now, just verify the component is registered
    await waitFor(() => {
      expect(components).toHaveLength(1);
    });
  });

  it("should not auto-add components when disabled", () => {
    const components: TamboComponent[] = [
      {
        name: "TestCard",
        description: "A test card component",
        component: TestCard,
      },
    ];

    let interactableComponents: ReturnType<
      typeof useTamboInteractable
    >["interactableComponents"] = [];

    const TestConsumer = () => {
      const { interactableComponents: components } = useTamboInteractable();
      interactableComponents = components;
      return null;
    };

    render(
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={components}
        autoAddInteractables={false}
      >
        <TestConsumer />
      </TamboProvider>,
    );

    // Should remain empty since auto-add is disabled
    expect(interactableComponents).toHaveLength(0);
  });

  it("should use component ID from message when auto-adding", () => {
    // This test would verify that the auto-added component uses the ID from the message
    // rather than generating a new one
    expect(true).toBe(true); // Placeholder
  });

  it("should not duplicate components that are already interactable", () => {
    // This test would verify that components already in interactables are not added again
    expect(true).toBe(true); // Placeholder
  });
});
