import { renderHook, waitFor } from "@testing-library/react";
import React, { type PropsWithChildren } from "react";
import { TamboProvider } from "./tambo-v1-provider";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import { useStreamState } from "./tambo-v1-stream-context";
import type { TamboComponent } from "../../model/component-metadata";
import { z } from "zod/v3";

// Mock components
const TestCard: React.FC<{ title: string; body: string }> = ({ title, body }) => (
  <div>
    <h1>{title}</h1>
    <p>{body}</p>
  </div>
);

const testComponents: TamboComponent[] = [
  {
    name: "TestCard",
    description: "A test card component",
    component: TestCard,
    propsSchema: z.object({
      title: z.string(),
      body: z.string(),
    }),
  },
];

describe("TamboProvider autoAddToInteractables", () => {
  const apiKey = "test-api-key";
  const userKey = "test-user";

  function Wrapper({
    children,
    autoAddToInteractables = false,
  }: PropsWithChildren<{ autoAddToInteractables?: boolean }>) {
    return (
      <TamboProvider
        apiKey={apiKey}
        userKey={userKey}
        components={testComponents}
        autoAddToInteractables={autoAddToInteractables}
      >
        {children}
      </TamboProvider>
    );
  }

  it("should not auto-add components when autoAddToInteractables is false", async () => {
    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        stream: useStreamState(),
      }),
      {
        wrapper: (props) => (
          <Wrapper autoAddToInteractables={false}>{props.children}</Wrapper>
        ),
      },
    );

    expect(result.current.interactable.interactableComponents).toHaveLength(0);
  });

  it("should not auto-add components when autoAddToInteractables is not provided (defaults to false)", async () => {
    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        stream: useStreamState(),
      }),
      {
        wrapper: Wrapper,
      },
    );

    expect(result.current.interactable.interactableComponents).toHaveLength(0);
  });

  it("should initialize with autoAddToInteractables enabled", async () => {
    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        stream: useStreamState(),
      }),
      {
        wrapper: (props) => (
          <Wrapper autoAddToInteractables={true}>{props.children}</Wrapper>
        ),
      },
    );

    // Initially, no components should be added (no completed components in stream yet)
    expect(result.current.interactable.interactableComponents).toHaveLength(0);
  });

  // Note: Testing the actual auto-addition of components would require
  // mocking the stream state with completed components, which is complex
  // and would require deeper integration testing. This basic test verifies
  // that the prop is accepted and the provider initializes correctly.
});
