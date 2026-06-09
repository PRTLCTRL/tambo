import { renderHook, render, waitFor } from "@testing-library/react";
import React from "react";
import { z } from "zod/v3";
import { TamboInteractableProvider } from "../../providers/tambo-interactable-provider";
import { TamboContextHelpersProvider } from "../../providers/tambo-context-helpers-provider";
import { TamboRegistryProvider } from "../../providers/tambo-registry-provider";
import { TamboProvider } from "../providers/tambo-v1-provider";
import { TamboClientProvider } from "../../providers/tambo-client-provider";
import { ComponentRenderer } from "../components/v1-component-renderer";
import type { TamboComponentContent } from "../types/message";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import type { TamboComponent } from "../../model/component-metadata";

const Card: React.FC<{ title: string; content: string }> = ({
  title,
  content,
}) => (
  <div>
    <h2>{title}</h2>
    <p>{content}</p>
  </div>
);

const cardComponent: TamboComponent = {
  name: "Card",
  description: "A simple card component",
  component: Card,
  props: z.object({
    title: z.string(),
    content: z.string(),
  }),
};

describe("Auto-Interactables Feature", () => {
  it("should automatically register components as interactables when autoAddInteractables is enabled", async () => {
    const componentContent: TamboComponentContent = {
      type: "component",
      id: "card-1",
      name: "Card",
      props: { title: "Test", content: "Hello" },
      state: {},
    };

    const InteractableChecker = () => {
      const { interactableComponents } = useTamboInteractable();
      return (
        <div>
          <ComponentRenderer
            content={componentContent}
            threadId="thread-1"
            messageId="msg-1"
          />
          <div data-testid="interactable-count">
            {interactableComponents.length}
          </div>
        </div>
      );
    };

    const { getByTestId } = render(
      <TamboClientProvider apiKey="test-key" userKey="user-1">
        <TamboRegistryProvider components={[cardComponent]}>
          <TamboContextHelpersProvider>
            <TamboInteractableProvider>
              <TamboProvider
                apiKey="test-key"
                userKey="user-1"
                autoAddInteractables={true}
              >
                <InteractableChecker />
              </TamboProvider>
            </TamboInteractableProvider>
          </TamboContextHelpersProvider>
        </TamboRegistryProvider>
      </TamboClientProvider>,
    );

    await waitFor(() => {
      const count = getByTestId("interactable-count");
      expect(count.textContent).toBe("1");
    });
  });

  it("should NOT automatically register components when autoAddInteractables is disabled", async () => {
    const componentContent: TamboComponentContent = {
      type: "component",
      id: "card-2",
      name: "Card",
      props: { title: "Test", content: "Hello" },
      state: {},
    };

    const InteractableChecker = () => {
      const { interactableComponents } = useTamboInteractable();
      return (
        <div>
          <ComponentRenderer
            content={componentContent}
            threadId="thread-1"
            messageId="msg-1"
          />
          <div data-testid="interactable-count">
            {interactableComponents.length}
          </div>
        </div>
      );
    };

    const { getByTestId } = render(
      <TamboClientProvider apiKey="test-key" userKey="user-1">
        <TamboRegistryProvider components={[cardComponent]}>
          <TamboContextHelpersProvider>
            <TamboInteractableProvider>
              <TamboProvider
                apiKey="test-key"
                userKey="user-1"
                autoAddInteractables={false}
              >
                <InteractableChecker />
              </TamboProvider>
            </TamboInteractableProvider>
          </TamboContextHelpersProvider>
        </TamboRegistryProvider>
      </TamboClientProvider>,
    );

    const count = getByTestId("interactable-count");
    expect(count.textContent).toBe("0");
  });

  it("should use the component ID from the message content", async () => {
    const componentContent: TamboComponentContent = {
      type: "component",
      id: "custom-id-123",
      name: "Card",
      props: { title: "Test", content: "Hello" },
      state: {},
    };

    const InteractableChecker = () => {
      const { interactableComponents } = useTamboInteractable();
      return (
        <div>
          <ComponentRenderer
            content={componentContent}
            threadId="thread-1"
            messageId="msg-1"
          />
          <div data-testid="interactable-id">
            {interactableComponents[0]?.id}
          </div>
        </div>
      );
    };

    const { getByTestId } = render(
      <TamboClientProvider apiKey="test-key" userKey="user-1">
        <TamboRegistryProvider components={[cardComponent]}>
          <TamboContextHelpersProvider>
            <TamboInteractableProvider>
              <TamboProvider
                apiKey="test-key"
                userKey="user-1"
                autoAddInteractables={true}
              >
                <InteractableChecker />
              </TamboProvider>
            </TamboInteractableProvider>
          </TamboContextHelpersProvider>
        </TamboRegistryProvider>
      </TamboClientProvider>,
    );

    await waitFor(() => {
      const id = getByTestId("interactable-id");
      expect(id.textContent).toBe("custom-id-123");
    });
  });

  it("should not re-register components that are already interactables", async () => {
    const componentContent: TamboComponentContent = {
      type: "component",
      id: "card-3",
      name: "Card",
      props: { title: "Test", content: "Hello" },
      state: {},
    };

    const InteractableChecker = () => {
      const { interactableComponents, addInteractableComponent } =
        useTamboInteractable();

      // Manually register the component first
      React.useEffect(() => {
        addInteractableComponent({
          id: "card-3",
          name: "Card",
          description: "A simple card",
          component: Card,
          props: { title: "Manual", content: "Registration" },
        });
      }, [addInteractableComponent]);

      return (
        <div>
          <ComponentRenderer
            content={componentContent}
            threadId="thread-1"
            messageId="msg-1"
          />
          <div data-testid="interactable-count">
            {interactableComponents.length}
          </div>
        </div>
      );
    };

    const { getByTestId } = render(
      <TamboClientProvider apiKey="test-key" userKey="user-1">
        <TamboRegistryProvider components={[cardComponent]}>
          <TamboContextHelpersProvider>
            <TamboInteractableProvider>
              <TamboProvider
                apiKey="test-key"
                userKey="user-1"
                autoAddInteractables={true}
              >
                <InteractableChecker />
              </TamboProvider>
            </TamboInteractableProvider>
          </TamboContextHelpersProvider>
        </TamboRegistryProvider>
      </TamboClientProvider>,
    );

    await waitFor(() => {
      const count = getByTestId("interactable-count");
      // Should still be 1, not 2 (no duplicate registration)
      expect(count.textContent).toBe("1");
    });
  });
});
