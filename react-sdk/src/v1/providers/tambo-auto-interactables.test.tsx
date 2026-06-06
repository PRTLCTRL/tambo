import { render, waitFor } from "@testing-library/react";
import React from "react";
import { TamboAutoInteractables } from "./tambo-auto-interactables";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import { useTamboRegistry } from "../../providers/tambo-registry-provider";
import { useTambo } from "../hooks/use-tambo-v1";
import { useTamboConfig } from "./tambo-v1-provider";
import type { TamboComponentContent } from "../types/message";
import type { TamboThreadMessage } from "../types/message";

jest.mock("../../providers/tambo-interactable-provider");
jest.mock("../../providers/tambo-registry-provider");
jest.mock("../hooks/use-tambo-v1");
jest.mock("./tambo-v1-provider");

const mockUseTamboInteractable = jest.mocked(useTamboInteractable);
const mockUseTamboRegistry = jest.mocked(useTamboRegistry);
const mockUseTambo = jest.mocked(useTambo);
const mockUseTamboConfig = jest.mocked(useTamboConfig);

describe("TamboAutoInteractables", () => {
  let mockAddInteractableComponent: jest.Mock;
  let mockGetComponent: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAddInteractableComponent = jest.fn().mockReturnValue("mock-id");
    mockGetComponent = jest.fn();

    mockUseTamboInteractable.mockReturnValue({
      addInteractableComponent: mockAddInteractableComponent,
      removeInteractableComponent: jest.fn(),
      updateInteractableComponentProps: jest.fn(),
      getInteractableComponent: jest.fn(),
      getInteractableComponentsByName: jest.fn(),
      clearAllInteractableComponents: jest.fn(),
      setInteractableState: jest.fn(),
      getInteractableComponentState: jest.fn(),
      setInteractableSelected: jest.fn(),
      clearInteractableSelections: jest.fn(),
      interactableComponents: [],
    });

    mockUseTamboRegistry.mockReturnValue({
      getComponent: mockGetComponent,
      registerComponent: jest.fn(),
      unregisterComponent: jest.fn(),
      registerTool: jest.fn(),
      unregisterTools: jest.fn(),
      getTool: jest.fn(),
      getComponents: jest.fn(),
      getTools: jest.fn(),
    });

    mockUseTambo.mockReturnValue({
      messages: [],
      isStreaming: false,
      currentThread: null,
      currentThreadId: undefined,
      initThread: jest.fn(),
      switchThread: jest.fn(),
      startNewThread: jest.fn(),
      threadError: null,
      streamingComponentIds: [],
      streamingToolIds: [],
      tool: jest.fn(),
      component: jest.fn(),
      isError: false,
      error: null,
      isToolExecuting: false,
    } as any);

    mockUseTamboConfig.mockReturnValue({
      autoRegisterComponentsAsInteractables: false,
    });
  });

  it("should not register components when feature is disabled", () => {
    mockUseTamboConfig.mockReturnValue({
      autoRegisterComponentsAsInteractables: false,
    });

    const componentContent: TamboComponentContent = {
      type: "component",
      id: "comp-1",
      name: "TestComponent",
      props: { title: "Test" },
      streamingState: "done",
    };

    const message: TamboThreadMessage = {
      id: "msg-1",
      role: "assistant",
      content: [componentContent],
      createdAt: new Date().toISOString(),
    };

    mockUseTambo.mockReturnValue({
      messages: [message],
      isStreaming: false,
    } as any);

    render(<TamboAutoInteractables />);

    expect(mockAddInteractableComponent).not.toHaveBeenCalled();
  });

  it("should register completed components when feature is enabled", async () => {
    mockUseTamboConfig.mockReturnValue({
      autoRegisterComponentsAsInteractables: true,
    });

    const registeredComponent = {
      name: "TestComponent",
      component: () => null,
      propsSchema: {},
      annotations: {},
    };

    mockGetComponent.mockReturnValue(registeredComponent);

    const componentContent: TamboComponentContent = {
      type: "component",
      id: "comp-1",
      name: "TestComponent",
      props: { title: "Test" },
      streamingState: "done",
    };

    const message: TamboThreadMessage = {
      id: "msg-1",
      role: "assistant",
      content: [componentContent],
      createdAt: new Date().toISOString(),
    };

    mockUseTambo.mockReturnValue({
      messages: [message],
      isStreaming: false,
    } as any);

    render(<TamboAutoInteractables />);

    await waitFor(() => {
      expect(mockGetComponent).toHaveBeenCalledWith("TestComponent");
      expect(mockAddInteractableComponent).toHaveBeenCalledWith({
        name: "TestComponent",
        props: { title: "Test" },
        propsSchema: {},
        state: undefined,
        annotations: {},
      });
    });
  });

  it("should not register components that are still streaming", async () => {
    mockUseTamboConfig.mockReturnValue({
      autoRegisterComponentsAsInteractables: true,
    });

    const componentContent: TamboComponentContent = {
      type: "component",
      id: "comp-1",
      name: "TestComponent",
      props: { title: "Test" },
      streamingState: "streaming",
    };

    const message: TamboThreadMessage = {
      id: "msg-1",
      role: "assistant",
      content: [componentContent],
      createdAt: new Date().toISOString(),
    };

    mockUseTambo.mockReturnValue({
      messages: [message],
      isStreaming: true,
    } as any);

    render(<TamboAutoInteractables />);

    expect(mockAddInteractableComponent).not.toHaveBeenCalled();
  });

  it("should not register the same component twice", async () => {
    mockUseTamboConfig.mockReturnValue({
      autoRegisterComponentsAsInteractables: true,
    });

    const registeredComponent = {
      name: "TestComponent",
      component: () => null,
      propsSchema: {},
      annotations: {},
    };

    mockGetComponent.mockReturnValue(registeredComponent);

    const componentContent: TamboComponentContent = {
      type: "component",
      id: "comp-1",
      name: "TestComponent",
      props: { title: "Test" },
      streamingState: "done",
    };

    const message: TamboThreadMessage = {
      id: "msg-1",
      role: "assistant",
      content: [componentContent],
      createdAt: new Date().toISOString(),
    };

    const { rerender } = render(<TamboAutoInteractables />);

    mockUseTambo.mockReturnValue({
      messages: [message],
      isStreaming: false,
    } as any);

    rerender(<TamboAutoInteractables />);

    await waitFor(() => {
      expect(mockAddInteractableComponent).toHaveBeenCalledTimes(1);
    });

    mockUseTambo.mockReturnValue({
      messages: [message],
      isStreaming: false,
    } as any);

    rerender(<TamboAutoInteractables />);

    expect(mockAddInteractableComponent).toHaveBeenCalledTimes(1);
  });

  it("should skip components not in registry", async () => {
    mockUseTamboConfig.mockReturnValue({
      autoRegisterComponentsAsInteractables: true,
    });

    mockGetComponent.mockReturnValue(null);

    const componentContent: TamboComponentContent = {
      type: "component",
      id: "comp-1",
      name: "UnknownComponent",
      props: { title: "Test" },
      streamingState: "done",
    };

    const message: TamboThreadMessage = {
      id: "msg-1",
      role: "assistant",
      content: [componentContent],
      createdAt: new Date().toISOString(),
    };

    mockUseTambo.mockReturnValue({
      messages: [message],
      isStreaming: false,
    } as any);

    const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

    render(<TamboAutoInteractables />);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        '[TamboAutoInteractables] Component "UnknownComponent" not found in registry, skipping auto-registration',
      );
    });

    expect(mockAddInteractableComponent).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("should handle multiple components in a single message", async () => {
    mockUseTamboConfig.mockReturnValue({
      autoRegisterComponentsAsInteractables: true,
    });

    const registeredComponent = {
      name: "TestComponent",
      component: () => null,
      propsSchema: {},
      annotations: {},
    };

    mockGetComponent.mockReturnValue(registeredComponent);

    const componentContent1: TamboComponentContent = {
      type: "component",
      id: "comp-1",
      name: "TestComponent",
      props: { title: "Test 1" },
      streamingState: "done",
    };

    const componentContent2: TamboComponentContent = {
      type: "component",
      id: "comp-2",
      name: "TestComponent",
      props: { title: "Test 2" },
      streamingState: "done",
    };

    const message: TamboThreadMessage = {
      id: "msg-1",
      role: "assistant",
      content: [componentContent1, componentContent2],
      createdAt: new Date().toISOString(),
    };

    mockUseTambo.mockReturnValue({
      messages: [message],
      isStreaming: false,
    } as any);

    render(<TamboAutoInteractables />);

    await waitFor(() => {
      expect(mockAddInteractableComponent).toHaveBeenCalledTimes(2);
    });
  });

  it("should skip user messages", async () => {
    mockUseTamboConfig.mockReturnValue({
      autoRegisterComponentsAsInteractables: true,
    });

    const componentContent: TamboComponentContent = {
      type: "component",
      id: "comp-1",
      name: "TestComponent",
      props: { title: "Test" },
      streamingState: "done",
    };

    const message: TamboThreadMessage = {
      id: "msg-1",
      role: "user",
      content: [componentContent],
      createdAt: new Date().toISOString(),
    };

    mockUseTambo.mockReturnValue({
      messages: [message],
      isStreaming: false,
    } as any);

    render(<TamboAutoInteractables />);

    expect(mockAddInteractableComponent).not.toHaveBeenCalled();
  });

  it("should include state when registering components", async () => {
    mockUseTamboConfig.mockReturnValue({
      autoRegisterComponentsAsInteractables: true,
    });

    const registeredComponent = {
      name: "TestComponent",
      component: () => null,
      propsSchema: {},
      annotations: {},
    };

    mockGetComponent.mockReturnValue(registeredComponent);

    const componentContent: TamboComponentContent = {
      type: "component",
      id: "comp-1",
      name: "TestComponent",
      props: { title: "Test" },
      state: { count: 5 },
      streamingState: "done",
    };

    const message: TamboThreadMessage = {
      id: "msg-1",
      role: "assistant",
      content: [componentContent],
      createdAt: new Date().toISOString(),
    };

    mockUseTambo.mockReturnValue({
      messages: [message],
      isStreaming: false,
    } as any);

    render(<TamboAutoInteractables />);

    await waitFor(() => {
      expect(mockAddInteractableComponent).toHaveBeenCalledWith({
        name: "TestComponent",
        props: { title: "Test" },
        propsSchema: {},
        state: { count: 5 },
        annotations: {},
      });
    });
  });
});
