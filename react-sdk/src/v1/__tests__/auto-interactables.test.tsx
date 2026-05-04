import { renderHook, waitFor } from "@testing-library/react";
import React, { PropsWithChildren } from "react";
import { z } from "zod/v3";
import { TamboProvider } from "../providers/tambo-v1-provider";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import { TamboRegistryContext } from "../../providers/tambo-registry-provider";
import { ComponentRenderer } from "../components/v1-component-renderer";
import { TamboComponentContent } from "../types/message";
import { render, screen } from "@testing-library/react";

const TestCard: React.FC<{ title: string; content: string }> = ({
  title,
  content,
}) => {
  return (
    <div data-testid="test-card">
      <h2>{title}</h2>
      <p>{content}</p>
    </div>
  );
};

const testComponents = [
  {
    name: "TestCard",
    description: "A test card component",
    component: TestCard,
    props: z.object({
      title: z.string(),
      content: z.string(),
    }),
  },
];

describe("Auto-Interactables Feature", () => {
  it("should not auto-register components when autoInteractables is disabled", async () => {
    const wrapper = ({ children }: PropsWithChildren) => (
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={testComponents}
        autoInteractables={false}
      >
        {children}
      </TamboProvider>
    );

    const { result } = renderHook(() => useTamboInteractable(), { wrapper });

    // Render a component
    const componentContent: TamboComponentContent = {
      type: "component",
      id: "test-card-1",
      name: "TestCard",
      props: { title: "Test", content: "Content" },
      state: {},
      streamingState: "complete",
    };

    const { unmount } = render(
      <wrapper>
        <ComponentRenderer
          content={componentContent}
          threadId="thread-1"
          messageId="msg-1"
        />
      </wrapper>,
    );

    await waitFor(() => {
      expect(result.current.interactableComponents.length).toBe(0);
    });

    unmount();
  });

  it("should auto-register components when autoInteractables is enabled", async () => {
    const wrapper = ({ children }: PropsWithChildren) => (
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={testComponents}
        autoInteractables={true}
      >
        {children}
      </TamboProvider>
    );

    const { result } = renderHook(() => useTamboInteractable(), { wrapper });

    // Render a complete component
    const componentContent: TamboComponentContent = {
      type: "component",
      id: "test-card-1",
      name: "TestCard",
      props: { title: "Test", content: "Content" },
      state: {},
      streamingState: "complete",
    };

    render(
      <wrapper>
        <ComponentRenderer
          content={componentContent}
          threadId="thread-1"
          messageId="msg-1"
        />
      </wrapper>,
    );

    await waitFor(() => {
      expect(result.current.interactableComponents.length).toBe(1);
      expect(result.current.interactableComponents[0].id).toBe("test-card-1");
      expect(result.current.interactableComponents[0].name).toBe("TestCard");
      expect(result.current.interactableComponents[0].props).toEqual({
        title: "Test",
        content: "Content",
      });
    });
  });

  it("should not auto-register streaming components", async () => {
    const wrapper = ({ children }: PropsWithChildren) => (
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={testComponents}
        autoInteractables={true}
      >
        {children}
      </TamboProvider>
    );

    const { result } = renderHook(() => useTamboInteractable(), { wrapper });

    // Render a streaming component
    const componentContent: TamboComponentContent = {
      type: "component",
      id: "test-card-1",
      name: "TestCard",
      props: { title: "Test", content: "Content" },
      state: {},
      streamingState: "streaming",
    };

    render(
      <wrapper>
        <ComponentRenderer
          content={componentContent}
          threadId="thread-1"
          messageId="msg-1"
        />
      </wrapper>,
    );

    await waitFor(() => {
      expect(result.current.interactableComponents.length).toBe(0);
    });
  });

  it("should use component ID from content as interactable ID", async () => {
    const wrapper = ({ children }: PropsWithChildren) => (
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={testComponents}
        autoInteractables={true}
      >
        {children}
      </TamboProvider>
    );

    const { result } = renderHook(() => useTamboInteractable(), { wrapper });

    const customId = "my-custom-component-id";
    const componentContent: TamboComponentContent = {
      type: "component",
      id: customId,
      name: "TestCard",
      props: { title: "Test", content: "Content" },
      state: {},
      streamingState: "complete",
    };

    render(
      <wrapper>
        <ComponentRenderer
          content={componentContent}
          threadId="thread-1"
          messageId="msg-1"
        />
      </wrapper>,
    );

    await waitFor(() => {
      const interactable = result.current.getInteractableComponent(customId);
      expect(interactable).toBeDefined();
      expect(interactable?.id).toBe(customId);
    });
  });

  it("should not duplicate interactable registration", async () => {
    const wrapper = ({ children }: PropsWithChildren) => (
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={testComponents}
        autoInteractables={true}
      >
        {children}
      </TamboProvider>
    );

    const { result } = renderHook(() => useTamboInteractable(), { wrapper });

    const componentContent: TamboComponentContent = {
      type: "component",
      id: "test-card-1",
      name: "TestCard",
      props: { title: "Test", content: "Content" },
      state: {},
      streamingState: "complete",
    };

    // Render the same component twice
    const { rerender } = render(
      <wrapper>
        <ComponentRenderer
          content={componentContent}
          threadId="thread-1"
          messageId="msg-1"
        />
      </wrapper>,
    );

    await waitFor(() => {
      expect(result.current.interactableComponents.length).toBe(1);
    });

    // Re-render
    rerender(
      <wrapper>
        <ComponentRenderer
          content={componentContent}
          threadId="thread-1"
          messageId="msg-1"
        />
      </wrapper>,
    );

    await waitFor(() => {
      // Should still be 1, not 2
      expect(result.current.interactableComponents.length).toBe(1);
    });
  });

  it("should register props schema from component registry", async () => {
    const wrapper = ({ children }: PropsWithChildren) => (
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={testComponents}
        autoInteractables={true}
      >
        {children}
      </TamboProvider>
    );

    const { result } = renderHook(() => useTamboInteractable(), { wrapper });

    const componentContent: TamboComponentContent = {
      type: "component",
      id: "test-card-1",
      name: "TestCard",
      props: { title: "Test", content: "Content" },
      state: {},
      streamingState: "complete",
    };

    render(
      <wrapper>
        <ComponentRenderer
          content={componentContent}
          threadId="thread-1"
          messageId="msg-1"
        />
      </wrapper>,
    );

    await waitFor(() => {
      const interactable = result.current.interactableComponents[0];
      expect(interactable.propsSchema).toBeDefined();
    });
  });
});
