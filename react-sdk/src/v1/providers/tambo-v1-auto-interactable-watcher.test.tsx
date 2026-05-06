import { act, renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { z } from "zod";
import { TamboProvider } from "./tambo-v1-provider";
import { TamboStubProvider } from "./tambo-v1-stub-provider";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import { useTambo } from "../hooks/use-tambo-v1";
import type { TamboComponent } from "../../model/component-metadata";

function TestCard({ title }: { title: string }) {
  return <div>{title}</div>;
}

const testComponents: TamboComponent[] = [
  {
    name: "TestCard",
    description: "A test card component",
    component: TestCard,
    propsSchema: z.object({ title: z.string() }),
  },
];

describe("AutoInteractableWatcher (via TamboProvider)", () => {
  it("should not add components when autoAddInteractables is false (default)", async () => {
    const { result } = renderHook(
      () => ({
        tambo: useTambo(),
        interactables: useTamboInteractable(),
      }),
      {
        wrapper: ({ children }) => (
          <TamboProvider
            apiKey="test"
            userKey="testuser"
            components={testComponents}
            autoAddInteractables={false}
          >
            <TamboStubProvider
              initialMessages={[
                {
                  id: "msg1",
                  role: "assistant",
                  content: [
                    {
                      type: "component",
                      componentName: "TestCard",
                      props: { title: "Test" },
                    },
                  ],
                },
              ]}
            >
              {children}
            </TamboStubProvider>
          </TamboProvider>
        ),
      },
    );

    await waitFor(() => {
      expect(result.current.tambo.messages.length).toBeGreaterThan(0);
    });

    expect(result.current.interactables.interactableComponents).toHaveLength(0);
  });

  it("should automatically add components when autoAddInteractables is true", async () => {
    const { result } = renderHook(
      () => ({
        tambo: useTambo(),
        interactables: useTamboInteractable(),
      }),
      {
        wrapper: ({ children }) => (
          <TamboProvider
            apiKey="test"
            userKey="testuser"
            components={testComponents}
            autoAddInteractables={true}
          >
            <TamboStubProvider
              initialMessages={[
                {
                  id: "msg1",
                  role: "assistant",
                  content: [
                    {
                      type: "component",
                      componentName: "TestCard",
                      props: { title: "Test Card" },
                    },
                  ],
                },
              ]}
            >
              {children}
            </TamboStubProvider>
          </TamboProvider>
        ),
      },
    );

    await waitFor(() => {
      expect(result.current.tambo.messages.length).toBeGreaterThan(0);
    });

    await waitFor(() => {
      expect(
        result.current.interactables.interactableComponents.length,
      ).toBeGreaterThan(0);
    });

    expect(result.current.interactables.interactableComponents[0].name).toBe(
      "TestCard",
    );
    expect(result.current.interactables.interactableComponents[0].props).toEqual(
      { title: "Test Card" },
    );
  });

  it("should skip components from user messages", async () => {
    const { result } = renderHook(
      () => ({
        tambo: useTambo(),
        interactables: useTamboInteractable(),
      }),
      {
        wrapper: ({ children }) => (
          <TamboProvider
            apiKey="test"
            userKey="testuser"
            components={testComponents}
            autoAddInteractables={true}
          >
            <TamboStubProvider
              initialMessages={[
                {
                  id: "msg1",
                  role: "user",
                  content: [
                    {
                      type: "component",
                      componentName: "TestCard",
                      props: { title: "Test" },
                    },
                  ],
                },
              ]}
            >
              {children}
            </TamboStubProvider>
          </TamboProvider>
        ),
      },
    );

    await waitFor(() => {
      expect(result.current.tambo.messages.length).toBeGreaterThan(0);
    });

    expect(result.current.interactables.interactableComponents).toHaveLength(0);
  });

  it("should add multiple components from different messages", async () => {
    const { result } = renderHook(
      () => ({
        tambo: useTambo(),
        interactables: useTamboInteractable(),
      }),
      {
        wrapper: ({ children }) => (
          <TamboProvider
            apiKey="test"
            userKey="testuser"
            components={testComponents}
            autoAddInteractables={true}
          >
            <TamboStubProvider
              initialMessages={[
                {
                  id: "msg1",
                  role: "assistant",
                  content: [
                    {
                      type: "component",
                      componentName: "TestCard",
                      props: { title: "First" },
                    },
                  ],
                },
                {
                  id: "msg2",
                  role: "assistant",
                  content: [
                    {
                      type: "component",
                      componentName: "TestCard",
                      props: { title: "Second" },
                    },
                  ],
                },
              ]}
            >
              {children}
            </TamboStubProvider>
          </TamboProvider>
        ),
      },
    );

    await waitFor(() => {
      expect(result.current.tambo.messages.length).toBeGreaterThan(0);
    });

    await waitFor(() => {
      expect(
        result.current.interactables.interactableComponents.length,
      ).toBeGreaterThanOrEqual(2);
    });

    expect(result.current.interactables.interactableComponents[0].props).toEqual(
      { title: "First" },
    );
    expect(result.current.interactables.interactableComponents[1].props).toEqual(
      { title: "Second" },
    );
  });
});
