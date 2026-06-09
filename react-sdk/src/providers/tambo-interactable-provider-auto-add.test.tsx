import { act, renderHook } from "@testing-library/react";
import React from "react";
import { z } from "zod";
import type { TamboComponent } from "../model/component-metadata";
import {
  TamboInteractableProvider,
  useTamboInteractable,
} from "./tambo-interactable-provider";

// Mock the context helpers
const mockAddContextHelper = jest.fn();
const mockRemoveContextHelper = jest.fn();

jest.mock("./tambo-context-helpers-provider", () => ({
  useTamboContextHelpers: () => ({
    addContextHelper: mockAddContextHelper,
    removeContextHelper: mockRemoveContextHelper,
  }),
}));

// Mock the registry provider
const mockRegisterTool = jest.fn();
const mockUnregisterTools = jest.fn();
const mockComponentList: TamboComponent[] = [
  {
    name: "TestCard",
    description: "A test card component",
    component: () => <div>Test Card</div>,
    propsSchema: z.object({
      title: z.string(),
      content: z.string(),
    }),
  },
];

jest.mock("./tambo-registry-provider", () => ({
  useTamboRegistry: () => ({
    registerTool: mockRegisterTool,
    unregisterTools: mockUnregisterTools,
    componentList: mockComponentList,
  }),
}));

// Mock the context helper creation
jest.mock("../context-helpers/current-interactables-context-helper", () => ({
  createInteractablesContextHelper: () =>
    jest.fn(() => ({
      name: "interactables",
      context: {
        description: "Test interactables context",
        components: [],
      },
    })),
}));

// Mock the config context
const mockConfig = { autoAddComponentsToInteractables: false };
jest.mock("../v1/providers/tambo-v1-provider", () => ({
  useTamboConfig: () => mockConfig,
}));

// Mock the stream state
const mockStreamState = {
  currentThreadId: "thread_test",
  threadMap: {
    thread_test: {
      thread: {
        messages: [] as Array<{
          role: string;
          content: Array<{
            type: string;
            id?: string;
            name?: string;
            props?: Record<string, unknown>;
          }>;
        }>,
      },
    },
  },
};

jest.mock("../v1/providers/tambo-v1-stream-context", () => ({
  useStreamState: () => mockStreamState,
}));

describe("TamboInteractableProvider - Auto Add Components", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig.autoAddComponentsToInteractables = false;
    mockStreamState.threadMap.thread_test.thread.messages = [];
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <TamboInteractableProvider>{children}</TamboInteractableProvider>
  );

  it("should not add components when auto-add is disabled", () => {
    mockConfig.autoAddComponentsToInteractables = false;
    mockStreamState.threadMap.thread_test.thread.messages = [
      {
        role: "assistant",
        content: [
          {
            type: "component",
            id: "comp_1",
            name: "TestCard",
            props: { title: "Test", content: "Content" },
          },
        ],
      },
    ];

    const { result } = renderHook(() => useTamboInteractable(), { wrapper });

    expect(result.current.interactableComponents).toHaveLength(0);
  });

  it("should automatically add components when auto-add is enabled", async () => {
    mockConfig.autoAddComponentsToInteractables = true;

    const { result, rerender } = renderHook(() => useTamboInteractable(), {
      wrapper,
    });

    // Initially no components
    expect(result.current.interactableComponents).toHaveLength(0);

    // Add a message with a component
    act(() => {
      mockStreamState.threadMap.thread_test.thread.messages = [
        {
          role: "assistant",
          content: [
            {
              type: "component",
              id: "comp_1",
              name: "TestCard",
              props: { title: "Test", content: "Content" },
            },
          ],
        },
      ];
    });

    // Force re-render to trigger the effect
    rerender();

    // Component should be added
    expect(result.current.interactableComponents.length).toBeGreaterThan(0);
    const addedComponent = result.current.interactableComponents[0];
    expect(addedComponent.name).toBe("TestCard");
    expect(addedComponent.props).toEqual({ title: "Test", content: "Content" });
  });

  it("should not add the same component twice", async () => {
    mockConfig.autoAddComponentsToInteractables = true;

    const { result, rerender } = renderHook(() => useTamboInteractable(), {
      wrapper,
    });

    // Add a message with a component
    act(() => {
      mockStreamState.threadMap.thread_test.thread.messages = [
        {
          role: "assistant",
          content: [
            {
              type: "component",
              id: "comp_1",
              name: "TestCard",
              props: { title: "Test", content: "Content" },
            },
          ],
        },
      ];
    });

    rerender();

    const countAfterFirst = result.current.interactableComponents.length;
    expect(countAfterFirst).toBeGreaterThan(0);

    // Re-render with the same message
    rerender();

    // Count should not change
    expect(result.current.interactableComponents.length).toBe(countAfterFirst);
  });

  it("should only add components from assistant messages", async () => {
    mockConfig.autoAddComponentsToInteractables = true;

    const { result, rerender } = renderHook(() => useTamboInteractable(), {
      wrapper,
    });

    // Add a message from user with a component (this shouldn't happen in practice)
    act(() => {
      mockStreamState.threadMap.thread_test.thread.messages = [
        {
          role: "user",
          content: [
            {
              type: "component",
              id: "comp_user",
              name: "TestCard",
              props: { title: "User", content: "Content" },
            },
          ],
        },
      ];
    });

    rerender();

    // Component should not be added
    expect(result.current.interactableComponents).toHaveLength(0);
  });

  it("should handle multiple components in a single message", async () => {
    mockConfig.autoAddComponentsToInteractables = true;

    const { result, rerender } = renderHook(() => useTamboInteractable(), {
      wrapper,
    });

    // Add a message with multiple components
    act(() => {
      mockStreamState.threadMap.thread_test.thread.messages = [
        {
          role: "assistant",
          content: [
            {
              type: "component",
              id: "comp_1",
              name: "TestCard",
              props: { title: "Card 1", content: "Content 1" },
            },
            {
              type: "text",
              text: "Here are two cards:",
            },
            {
              type: "component",
              id: "comp_2",
              name: "TestCard",
              props: { title: "Card 2", content: "Content 2" },
            },
          ],
        },
      ];
    });

    rerender();

    // Both components should be added
    expect(result.current.interactableComponents.length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it("should skip components that are not in the registry", async () => {
    mockConfig.autoAddComponentsToInteractables = true;

    const { result, rerender } = renderHook(() => useTamboInteractable(), {
      wrapper,
    });

    // Add a message with an unregistered component
    act(() => {
      mockStreamState.threadMap.thread_test.thread.messages = [
        {
          role: "assistant",
          content: [
            {
              type: "component",
              id: "comp_unknown",
              name: "UnknownComponent",
              props: { foo: "bar" },
            },
          ],
        },
      ];
    });

    rerender();

    // Component should not be added
    expect(result.current.interactableComponents).toHaveLength(0);
  });

  it("should handle components across multiple messages", async () => {
    mockConfig.autoAddComponentsToInteractables = true;

    const { result, rerender } = renderHook(() => useTamboInteractable(), {
      wrapper,
    });

    // Add first message
    act(() => {
      mockStreamState.threadMap.thread_test.thread.messages = [
        {
          role: "assistant",
          content: [
            {
              type: "component",
              id: "comp_1",
              name: "TestCard",
              props: { title: "Card 1", content: "Content 1" },
            },
          ],
        },
      ];
    });

    rerender();

    expect(result.current.interactableComponents.length).toBeGreaterThan(0);
    const countAfterFirst = result.current.interactableComponents.length;

    // Add second message
    act(() => {
      mockStreamState.threadMap.thread_test.thread.messages.push({
        role: "assistant",
        content: [
          {
            type: "component",
            id: "comp_2",
            name: "TestCard",
            props: { title: "Card 2", content: "Content 2" },
          },
        ],
      });
    });

    rerender();

    // Should have both components
    expect(result.current.interactableComponents.length).toBeGreaterThan(
      countAfterFirst,
    );
  });
});
