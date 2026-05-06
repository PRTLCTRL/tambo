import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { z } from "zod/v3";
import type { TamboComponent } from "../model/component-metadata";
import { TamboContextHelpersProvider } from "./tambo-context-helpers-provider";
import {
  TamboInteractableProvider,
  useTamboInteractable,
} from "./tambo-interactable-provider";
import { TamboRegistryProvider } from "./tambo-registry-provider";

// Mock the v1 stream context
const mockStreamState = {
  currentThreadId: "thread-1",
  threads: {
    "thread-1": {
      id: "thread-1",
      messages: [
        {
          id: "msg-1",
          role: "assistant" as const,
          content: [
            {
              type: "component" as const,
              id: "comp-1",
              name: "TestComponent",
              props: { title: "Hello", count: 42 },
            },
          ],
        },
      ],
    },
  },
};

jest.mock("../v1/providers/tambo-v1-stream-context", () => ({
  useStreamState: jest.fn(() => mockStreamState),
}));

const TestComponent: React.FC<{ title: string; count: number }> = ({
  title,
  count,
}) => (
  <div>
    {title}: {count}
  </div>
);

const testComponents: TamboComponent[] = [
  {
    name: "TestComponent",
    component: TestComponent,
    description: "A test component",
    props: z.object({
      title: z.string(),
      count: z.number(),
    }),
  },
];

describe("TamboInteractableProvider - Auto Add", () => {
  const createWrapper = (autoAddToInteractables = false) => {
    return ({ children }: { children: React.ReactNode }) => (
      <TamboRegistryProvider components={testComponents}>
        <TamboContextHelpersProvider>
          <TamboInteractableProvider
            autoAddToInteractables={autoAddToInteractables}
          >
            {children}
          </TamboInteractableProvider>
        </TamboContextHelpersProvider>
      </TamboRegistryProvider>
    );
  };

  it("does not auto-add components when autoAddToInteractables is false", () => {
    const { result } = renderHook(() => useTamboInteractable(), {
      wrapper: createWrapper(false),
    });

    expect(result.current.interactableComponents).toHaveLength(0);
  });

  it("auto-adds components when autoAddToInteractables is true", async () => {
    const { result } = renderHook(() => useTamboInteractable(), {
      wrapper: createWrapper(true),
    });

    await waitFor(() => {
      expect(result.current.interactableComponents.length).toBeGreaterThan(0);
    });

    const addedComponent = result.current.interactableComponents[0];
    expect(addedComponent.name).toBe("TestComponent");
    expect(addedComponent.props).toEqual({ title: "Hello", count: 42 });
  });

  it("does not duplicate components that are already added", async () => {
    const { result, rerender } = renderHook(() => useTamboInteractable(), {
      wrapper: createWrapper(true),
    });

    await waitFor(() => {
      expect(result.current.interactableComponents.length).toBeGreaterThan(0);
    });

    const initialCount = result.current.interactableComponents.length;

    rerender();

    await waitFor(() => {
      expect(result.current.interactableComponents).toHaveLength(initialCount);
    });
  });

  it("auto-adds multiple components from the same message", async () => {
    const mockStateWithMultipleComponents = {
      currentThreadId: "thread-1",
      threads: {
        "thread-1": {
          id: "thread-1",
          messages: [
            {
              id: "msg-1",
              role: "assistant" as const,
              content: [
                {
                  type: "component" as const,
                  id: "comp-1",
                  name: "TestComponent",
                  props: { title: "First", count: 1 },
                },
                {
                  type: "component" as const,
                  id: "comp-2",
                  name: "TestComponent",
                  props: { title: "Second", count: 2 },
                },
              ],
            },
          ],
        },
      },
    };

    jest
      .spyOn(
        require("../v1/providers/tambo-v1-stream-context"),
        "useStreamState",
      )
      .mockReturnValue(mockStateWithMultipleComponents);

    const { result } = renderHook(() => useTamboInteractable(), {
      wrapper: createWrapper(true),
    });

    await waitFor(() => {
      expect(result.current.interactableComponents.length).toBe(2);
    });

    expect(result.current.interactableComponents[0].props).toEqual({
      title: "First",
      count: 1,
    });
    expect(result.current.interactableComponents[1].props).toEqual({
      title: "Second",
      count: 2,
    });
  });

  it("only auto-adds components from assistant messages", async () => {
    const mockStateWithUserMessage = {
      currentThreadId: "thread-1",
      threads: {
        "thread-1": {
          id: "thread-1",
          messages: [
            {
              id: "msg-user",
              role: "user" as const,
              content: [
                {
                  type: "component" as const,
                  id: "comp-user",
                  name: "TestComponent",
                  props: { title: "User", count: 99 },
                },
              ],
            },
            {
              id: "msg-assistant",
              role: "assistant" as const,
              content: [
                {
                  type: "component" as const,
                  id: "comp-assistant",
                  name: "TestComponent",
                  props: { title: "Assistant", count: 1 },
                },
              ],
            },
          ],
        },
      },
    };

    jest
      .spyOn(
        require("../v1/providers/tambo-v1-stream-context"),
        "useStreamState",
      )
      .mockReturnValue(mockStateWithUserMessage);

    const { result } = renderHook(() => useTamboInteractable(), {
      wrapper: createWrapper(true),
    });

    await waitFor(() => {
      expect(result.current.interactableComponents.length).toBe(1);
    });

    expect(result.current.interactableComponents[0].props).toEqual({
      title: "Assistant",
      count: 1,
    });
  });
});
