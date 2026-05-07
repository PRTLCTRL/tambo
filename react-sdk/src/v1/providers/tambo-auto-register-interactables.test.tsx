import { renderHook, waitFor } from "@testing-library/react";
import { AutoRegisterInteractables } from "./tambo-auto-register-interactables";
import { useStreamState } from "./tambo-v1-stream-context";
import { useTamboConfig } from "./tambo-v1-provider";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import { useTamboRegistry } from "../../providers/tambo-registry-provider";
import type { StreamState } from "@tambo-ai/client";
import type { TamboComponentContent } from "../types/message";
import { z } from "zod/v3";

jest.mock("./tambo-v1-stream-context");
jest.mock("./tambo-v1-provider");
jest.mock("../../providers/tambo-interactable-provider");
jest.mock("../../providers/tambo-registry-provider");

const mockUseStreamState = jest.mocked(useStreamState);
const mockUseTamboConfig = jest.mocked(useTamboConfig);
const mockUseTamboInteractable = jest.mocked(useTamboInteractable);
const mockUseTamboRegistry = jest.mocked(useTamboRegistry);

describe("AutoRegisterInteractables", () => {
  const mockAddInteractableComponent = jest.fn();
  const mockGetComponent = jest.fn();

  const createComponentContent = (
    id: string,
    name: string,
    props: Record<string, unknown> = {},
  ): TamboComponentContent => ({
    type: "component",
    id,
    name,
    props,
  });

  const createStreamState = (
    components: TamboComponentContent[],
  ): StreamState => ({
    currentThreadId: "thread_1",
    threadMap: {
      thread_1: {
        thread: {
          id: "thread_1",
          object: "thread",
          messages: [
            {
              id: "msg_1",
              role: "assistant",
              content: components,
            },
          ],
          createdAt: new Date().toISOString(),
        },
        streaming: { status: "idle" },
      },
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseTamboInteractable.mockReturnValue({
      addInteractableComponent: mockAddInteractableComponent,
      removeInteractableComponent: jest.fn(),
      updateInteractableComponentProps: jest.fn(),
      getInteractableComponent: jest.fn(),
      getInteractableComponentsByName: jest.fn(),
      clearAllInteractableComponents: jest.fn(),
      interactableComponents: [],
      setInteractableState: jest.fn(),
      getInteractableComponentState: jest.fn(),
      setInteractableSelected: jest.fn(),
      clearInteractableSelections: jest.fn(),
    });

    mockUseTamboRegistry.mockReturnValue({
      getComponent: mockGetComponent,
      registerComponent: jest.fn(),
      unregisterComponent: jest.fn(),
      getTool: jest.fn(),
      registerTool: jest.fn(),
      unregisterTools: jest.fn(),
      getAllTools: jest.fn(),
      getAllComponents: jest.fn(),
      getResourceSource: jest.fn(),
      registerResourceSource: jest.fn(),
    });
  });

  it("should not register components when autoRegisterInteractables is false", () => {
    mockUseTamboConfig.mockReturnValue({
      autoRegisterInteractables: false,
    });

    const component = createComponentContent("comp_1", "TestComponent");
    mockUseStreamState.mockReturnValue(createStreamState([component]));
    mockGetComponent.mockReturnValue({
      name: "TestComponent",
      description: "A test component",
      component: () => null,
      propsSchema: z.object({}),
    });

    renderHook(() => <AutoRegisterInteractables />);

    expect(mockAddInteractableComponent).not.toHaveBeenCalled();
  });

  it("should not register components when autoRegisterInteractables is undefined", () => {
    mockUseTamboConfig.mockReturnValue({});

    const component = createComponentContent("comp_1", "TestComponent");
    mockUseStreamState.mockReturnValue(createStreamState([component]));
    mockGetComponent.mockReturnValue({
      name: "TestComponent",
      description: "A test component",
      component: () => null,
      propsSchema: z.object({}),
    });

    renderHook(() => <AutoRegisterInteractables />);

    expect(mockAddInteractableComponent).not.toHaveBeenCalled();
  });

  it("should register components when autoRegisterInteractables is true", async () => {
    mockUseTamboConfig.mockReturnValue({
      autoRegisterInteractables: true,
    });

    const propsSchema = z.object({ value: z.number() });
    const component = createComponentContent("comp_1", "TestComponent", {
      value: 42,
    });
    mockUseStreamState.mockReturnValue(createStreamState([component]));
    mockGetComponent.mockReturnValue({
      name: "TestComponent",
      description: "A test component",
      component: () => null,
      propsSchema,
    });

    renderHook(() => <AutoRegisterInteractables />);

    await waitFor(() => {
      expect(mockAddInteractableComponent).toHaveBeenCalledWith({
        name: "TestComponent",
        props: { value: 42 },
        propsSchema,
        annotations: undefined,
      });
    });
  });

  it("should not register the same component twice", async () => {
    mockUseTamboConfig.mockReturnValue({
      autoRegisterInteractables: true,
    });

    const component = createComponentContent("comp_1", "TestComponent");
    const initialState = createStreamState([component]);

    mockUseStreamState.mockReturnValue(initialState);
    mockGetComponent.mockReturnValue({
      name: "TestComponent",
      description: "A test component",
      component: () => null,
      propsSchema: z.object({}),
    });

    const { rerender } = renderHook(() => <AutoRegisterInteractables />);

    await waitFor(() => {
      expect(mockAddInteractableComponent).toHaveBeenCalledTimes(1);
    });

    rerender();

    expect(mockAddInteractableComponent).toHaveBeenCalledTimes(1);
  });

  it("should register multiple different components", async () => {
    mockUseTamboConfig.mockReturnValue({
      autoRegisterInteractables: true,
    });

    const comp1 = createComponentContent("comp_1", "ComponentA");
    const comp2 = createComponentContent("comp_2", "ComponentB");
    mockUseStreamState.mockReturnValue(createStreamState([comp1, comp2]));

    mockGetComponent.mockImplementation((name) => ({
      name,
      description: `A ${name} component`,
      component: () => null,
      propsSchema: z.object({}),
    }));

    renderHook(() => <AutoRegisterInteractables />);

    await waitFor(() => {
      expect(mockAddInteractableComponent).toHaveBeenCalledTimes(2);
      expect(mockAddInteractableComponent).toHaveBeenCalledWith({
        name: "ComponentA",
        props: {},
        propsSchema: z.object({}),
        annotations: undefined,
      });
      expect(mockAddInteractableComponent).toHaveBeenCalledWith({
        name: "ComponentB",
        props: {},
        propsSchema: z.object({}),
        annotations: undefined,
      });
    });
  });

  it("should not register components that are not in the registry", async () => {
    mockUseTamboConfig.mockReturnValue({
      autoRegisterInteractables: true,
    });

    const component = createComponentContent("comp_1", "UnknownComponent");
    mockUseStreamState.mockReturnValue(createStreamState([component]));
    mockGetComponent.mockReturnValue(undefined);

    renderHook(() => <AutoRegisterInteractables />);

    await waitFor(() => {
      expect(mockAddInteractableComponent).not.toHaveBeenCalled();
    });
  });

  it("should silently skip components that fail to register", async () => {
    mockUseTamboConfig.mockReturnValue({
      autoRegisterInteractables: true,
    });

    const component = createComponentContent("comp_1", "TestComponent");
    mockUseStreamState.mockReturnValue(createStreamState([component]));
    mockGetComponent.mockReturnValue({
      name: "TestComponent",
      description: "A test component",
      component: () => null,
      propsSchema: z.object({}),
    });

    mockAddInteractableComponent.mockImplementation(() => {
      throw new Error("Registration failed");
    });

    expect(() => {
      renderHook(() => <AutoRegisterInteractables />);
    }).not.toThrow();
  });

  it("should include component annotations when available", async () => {
    mockUseTamboConfig.mockReturnValue({
      autoRegisterInteractables: true,
    });

    const component = createComponentContent("comp_1", "TestComponent");
    mockUseStreamState.mockReturnValue(createStreamState([component]));
    
    const annotations = { customAnnotation: "value" };
    mockGetComponent.mockReturnValue({
      name: "TestComponent",
      description: "A test component",
      component: () => null,
      propsSchema: z.object({}),
      annotations,
    });

    renderHook(() => <AutoRegisterInteractables />);

    await waitFor(() => {
      expect(mockAddInteractableComponent).toHaveBeenCalledWith({
        name: "TestComponent",
        props: {},
        propsSchema: z.object({}),
        annotations,
      });
    });
  });
});
