import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { TamboInteractableProvider } from "../../providers/tambo-interactable-provider";
import { TamboRegistryProvider } from "../../providers/tambo-registry-provider";
import { AutoInteractablesManager } from "./tambo-v1-auto-interactables";
import { TamboConfigContext } from "./tambo-v1-provider";
import {
  StreamStateContext,
  StreamDispatchContext,
} from "./tambo-v1-stream-context";
import type { StreamState } from "@tambo-ai/client";
import { z } from "zod";

const TestComponent: React.FC<{ title: string; content: string }> = ({
  title,
  content,
}) => (
  <div>
    <h1>{title}</h1>
    <p>{content}</p>
  </div>
);

const testComponentMeta = {
  name: "TestComponent",
  description: "A test component",
  component: TestComponent,
  props: z.object({
    title: z.string(),
    content: z.string(),
  }),
};

describe("AutoInteractablesManager", () => {
  it("should not add components when autoInteractables is disabled", async () => {
    const mockAddInteractableComponent = jest.fn();
    const streamState: StreamState = {
      currentThreadId: "thread-1",
      threadMap: {
        "thread-1": {
          thread: {
            id: "thread-1",
            messages: [
              {
                id: "msg-1",
                role: "assistant",
                content: [
                  {
                    type: "component",
                    id: "comp-1",
                    name: "TestComponent",
                    props: { title: "Hello", content: "World" },
                    streamingState: "complete",
                  },
                ],
              },
            ],
          },
          streaming: false,
        },
      },
    };

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TamboRegistryProvider components={[testComponentMeta]}>
        <TamboInteractableProvider>
          <TamboConfigContext.Provider value={{ autoInteractables: false }}>
            <StreamStateContext.Provider value={streamState}>
              <StreamDispatchContext.Provider value={jest.fn()}>
                {children}
              </StreamDispatchContext.Provider>
            </StreamStateContext.Provider>
          </TamboConfigContext.Provider>
        </TamboInteractableProvider>
      </TamboRegistryProvider>
    );

    jest.spyOn(
      require("../../providers/tambo-interactable-provider"),
      "useTamboInteractable",
    ).mockReturnValue({
      addInteractableComponent: mockAddInteractableComponent,
      interactableComponents: [],
    });

    renderHook(() => <AutoInteractablesManager />, { wrapper });

    await waitFor(() => {
      expect(mockAddInteractableComponent).not.toHaveBeenCalled();
    });
  });

  it("should add completed components when autoInteractables is enabled", async () => {
    const mockAddInteractableComponent = jest.fn().mockReturnValue("comp-1-xyz");
    const streamState: StreamState = {
      currentThreadId: "thread-1",
      threadMap: {
        "thread-1": {
          thread: {
            id: "thread-1",
            messages: [
              {
                id: "msg-1",
                role: "assistant",
                content: [
                  {
                    type: "component",
                    id: "comp-1",
                    name: "TestComponent",
                    props: { title: "Hello", content: "World" },
                    streamingState: "complete",
                  },
                ],
              },
            ],
          },
          streaming: false,
        },
      },
    };

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TamboRegistryProvider components={[testComponentMeta]}>
        <TamboInteractableProvider>
          <TamboConfigContext.Provider value={{ autoInteractables: true }}>
            <StreamStateContext.Provider value={streamState}>
              <StreamDispatchContext.Provider value={jest.fn()}>
                {children}
              </StreamDispatchContext.Provider>
            </StreamStateContext.Provider>
          </TamboConfigContext.Provider>
        </TamboInteractableProvider>
      </TamboRegistryProvider>
    );

    jest.spyOn(
      require("../../providers/tambo-interactable-provider"),
      "useTamboInteractable",
    ).mockReturnValue({
      addInteractableComponent: mockAddInteractableComponent,
      interactableComponents: [],
    });

    renderHook(() => <AutoInteractablesManager />, { wrapper });

    await waitFor(() => {
      expect(mockAddInteractableComponent).toHaveBeenCalledWith({
        name: "TestComponent",
        props: { title: "Hello", content: "World" },
        propsSchema: testComponentMeta.props,
      });
    });
  });

  it("should not add components that are still streaming", async () => {
    const mockAddInteractableComponent = jest.fn();
    const streamState: StreamState = {
      currentThreadId: "thread-1",
      threadMap: {
        "thread-1": {
          thread: {
            id: "thread-1",
            messages: [
              {
                id: "msg-1",
                role: "assistant",
                content: [
                  {
                    type: "component",
                    id: "comp-1",
                    name: "TestComponent",
                    props: { title: "Hello", content: "World" },
                    streamingState: "streaming",
                  },
                ],
              },
            ],
          },
          streaming: true,
        },
      },
    };

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TamboRegistryProvider components={[testComponentMeta]}>
        <TamboInteractableProvider>
          <TamboConfigContext.Provider value={{ autoInteractables: true }}>
            <StreamStateContext.Provider value={streamState}>
              <StreamDispatchContext.Provider value={jest.fn()}>
                {children}
              </StreamDispatchContext.Provider>
            </StreamStateContext.Provider>
          </TamboConfigContext.Provider>
        </TamboInteractableProvider>
      </TamboRegistryProvider>
    );

    jest.spyOn(
      require("../../providers/tambo-interactable-provider"),
      "useTamboInteractable",
    ).mockReturnValue({
      addInteractableComponent: mockAddInteractableComponent,
      interactableComponents: [],
    });

    renderHook(() => <AutoInteractablesManager />, { wrapper });

    await waitFor(() => {
      expect(mockAddInteractableComponent).not.toHaveBeenCalled();
    });
  });

  it("should not add the same component twice", async () => {
    const mockAddInteractableComponent = jest.fn().mockReturnValue("comp-1-xyz");
    const streamState: StreamState = {
      currentThreadId: "thread-1",
      threadMap: {
        "thread-1": {
          thread: {
            id: "thread-1",
            messages: [
              {
                id: "msg-1",
                role: "assistant",
                content: [
                  {
                    type: "component",
                    id: "comp-1",
                    name: "TestComponent",
                    props: { title: "Hello", content: "World" },
                    streamingState: "complete",
                  },
                ],
              },
            ],
          },
          streaming: false,
        },
      },
    };

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TamboRegistryProvider components={[testComponentMeta]}>
        <TamboInteractableProvider>
          <TamboConfigContext.Provider value={{ autoInteractables: true }}>
            <StreamStateContext.Provider value={streamState}>
              <StreamDispatchContext.Provider value={jest.fn()}>
                {children}
              </StreamDispatchContext.Provider>
            </StreamStateContext.Provider>
          </TamboConfigContext.Provider>
        </TamboInteractableProvider>
      </TamboRegistryProvider>
    );

    jest.spyOn(
      require("../../providers/tambo-interactable-provider"),
      "useTamboInteractable",
    ).mockReturnValue({
      addInteractableComponent: mockAddInteractableComponent,
      interactableComponents: [],
    });

    const { rerender } = renderHook(() => <AutoInteractablesManager />, {
      wrapper,
    });

    await waitFor(() => {
      expect(mockAddInteractableComponent).toHaveBeenCalledTimes(1);
    });

    rerender();

    await waitFor(() => {
      expect(mockAddInteractableComponent).toHaveBeenCalledTimes(1);
    });
  });

  it("should skip user messages", async () => {
    const mockAddInteractableComponent = jest.fn();
    const streamState: StreamState = {
      currentThreadId: "thread-1",
      threadMap: {
        "thread-1": {
          thread: {
            id: "thread-1",
            messages: [
              {
                id: "msg-1",
                role: "user",
                content: [
                  {
                    type: "component",
                    id: "comp-1",
                    name: "TestComponent",
                    props: { title: "Hello", content: "World" },
                    streamingState: "complete",
                  },
                ],
              },
            ],
          },
          streaming: false,
        },
      },
    };

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TamboRegistryProvider components={[testComponentMeta]}>
        <TamboInteractableProvider>
          <TamboConfigContext.Provider value={{ autoInteractables: true }}>
            <StreamStateContext.Provider value={streamState}>
              <StreamDispatchContext.Provider value={jest.fn()}>
                {children}
              </StreamDispatchContext.Provider>
            </StreamStateContext.Provider>
          </TamboConfigContext.Provider>
        </TamboInteractableProvider>
      </TamboRegistryProvider>
    );

    jest.spyOn(
      require("../../providers/tambo-interactable-provider"),
      "useTamboInteractable",
    ).mockReturnValue({
      addInteractableComponent: mockAddInteractableComponent,
      interactableComponents: [],
    });

    renderHook(() => <AutoInteractablesManager />, { wrapper });

    await waitFor(() => {
      expect(mockAddInteractableComponent).not.toHaveBeenCalled();
    });
  });

  it("should warn when component is not in registry", async () => {
    const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();
    const mockAddInteractableComponent = jest.fn();
    const streamState: StreamState = {
      currentThreadId: "thread-1",
      threadMap: {
        "thread-1": {
          thread: {
            id: "thread-1",
            messages: [
              {
                id: "msg-1",
                role: "assistant",
                content: [
                  {
                    type: "component",
                    id: "comp-1",
                    name: "UnknownComponent",
                    props: { title: "Hello", content: "World" },
                    streamingState: "complete",
                  },
                ],
              },
            ],
          },
          streaming: false,
        },
      },
    };

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TamboRegistryProvider components={[testComponentMeta]}>
        <TamboInteractableProvider>
          <TamboConfigContext.Provider value={{ autoInteractables: true }}>
            <StreamStateContext.Provider value={streamState}>
              <StreamDispatchContext.Provider value={jest.fn()}>
                {children}
              </StreamDispatchContext.Provider>
            </StreamStateContext.Provider>
          </TamboConfigContext.Provider>
        </TamboInteractableProvider>
      </TamboRegistryProvider>
    );

    jest.spyOn(
      require("../../providers/tambo-interactable-provider"),
      "useTamboInteractable",
    ).mockReturnValue({
      addInteractableComponent: mockAddInteractableComponent,
      interactableComponents: [],
    });

    renderHook(() => <AutoInteractablesManager />, { wrapper });

    await waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "[AutoInteractables] Component UnknownComponent not found in registry",
      );
    });

    expect(mockAddInteractableComponent).not.toHaveBeenCalled();
    consoleWarnSpy.mockRestore();
  });
});
