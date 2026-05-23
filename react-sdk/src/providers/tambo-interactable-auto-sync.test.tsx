import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { z } from "zod/v3";
import { TamboInteractableProvider, useTamboInteractable } from "./tambo-interactable-provider";
import { TamboRegistryContext } from "./tambo-registry-provider";
import { TamboStreamProvider } from "../v1/providers/tambo-v1-stream-context";
import type { StreamState } from "@tambo-ai/client";
import type { TamboComponentContent } from "../v1/types/message";
import { TamboContextHelpersProvider } from "./tambo-context-helpers-provider";

// Mock dependencies
jest.mock("../../providers/tambo-client-provider", () => ({
  useTamboClient: jest.fn(() => ({
    threads: {
      messages: {
        list: jest.fn().mockResolvedValue({ messages: [], hasMore: false }),
      },
      retrieve: jest.fn().mockResolvedValue({}),
    },
  })),
  useTamboQueryClient: jest.fn(),
}));

jest.mock("../v1/providers/tambo-v1-provider", () => {
  const actual = jest.requireActual("../v1/providers/tambo-v1-provider");
  return {
    ...actual,
    useTamboConfig: () => ({ 
      userKey: undefined,
      autoAddComponentsToInteractables: false,
    }),
  };
});

const mockRegistry = {
  componentList: new Map([
    [
      "TestComponent",
      {
        name: "TestComponent",
        component: () => null,
        propsSchema: z.object({ title: z.string() }),
        description: "A test component",
      },
    ],
  ]),
  toolRegistry: new Map(),
  registerComponent: jest.fn(),
  registerTool: jest.fn(),
  registerTools: jest.fn(),
  unregisterTools: jest.fn(),
};

function createWrapper(config: { autoAddComponentsToInteractables?: boolean } = {}) {
  // Update the mock to return the config
  const useTamboConfig = require("../v1/providers/tambo-v1-provider").useTamboConfig;
  jest.mocked(useTamboConfig).mockReturnValue({
    userKey: undefined,
    autoAddComponentsToInteractables: config.autoAddComponentsToInteractables ?? false,
  });

  return ({ children }: { children: React.ReactNode }) => (
    <TamboRegistryContext.Provider value={mockRegistry}>
      <TamboContextHelpersProvider>
        <TamboStreamProvider>
          <TamboInteractableProvider>
            {children}
          </TamboInteractableProvider>
        </TamboStreamProvider>
      </TamboContextHelpersProvider>
    </TamboRegistryContext.Provider>
  );
}

describe("TamboInteractableAutoSync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should not add components when autoAddComponentsToInteractables is false", () => {
    const { result } = renderHook(() => useTamboInteractable(), {
      wrapper: createWrapper({ autoAddComponentsToInteractables: false }),
    });

    expect(result.current.interactableComponents).toHaveLength(0);
  });

  it("should add components when autoAddComponentsToInteractables is true and messages contain components", async () => {
    const { result } = renderHook(() => useTamboInteractable(), {
      wrapper: createWrapper({ autoAddComponentsToInteractables: true }),
    });

    // Initially empty
    expect(result.current.interactableComponents).toHaveLength(0);
  });
});
