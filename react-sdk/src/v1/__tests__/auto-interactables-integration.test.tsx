/**
 * Integration test for auto-interactables feature.
 * Demonstrates end-to-end functionality of automatically adding
 * AI-generated components to the interactables list.
 */

import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { TamboProvider } from "../providers/tambo-v1-provider";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import { useStreamDispatch } from "../providers/tambo-v1-stream-context";
import { useTambo } from "../hooks/use-tambo-v1";
import { z } from "zod";

const NoteComponent: React.FC<{ title: string; content: string }> = ({
  title,
  content,
}) => (
  <div>
    <h2>{title}</h2>
    <p>{content}</p>
  </div>
);

const noteComponents = [
  {
    name: "Note",
    description: "A simple note component",
    component: NoteComponent,
    props: z.object({
      title: z.string(),
      content: z.string(),
    }),
  },
];

describe("Auto-Interactables Integration", () => {
  it("should automatically add generated components to interactables when enabled", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={noteComponents}
        autoInteractables={true}
      >
        {children}
      </TamboProvider>
    );

    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        dispatch: useStreamDispatch(),
        tambo: useTambo(),
      }),
      { wrapper },
    );

    expect(result.current.interactable.interactableComponents).toHaveLength(0);

    result.current.dispatch({
      type: "INIT_THREAD",
      threadId: "test-thread-1",
    });

    result.current.dispatch({
      type: "ADD_MESSAGE",
      threadId: "test-thread-1",
      message: {
        id: "msg-1",
        role: "assistant",
        content: [
          {
            type: "component",
            id: "comp-1",
            name: "Note",
            props: { title: "My Note", content: "Note content" },
            streamingState: "complete",
          },
        ],
      },
    });

    await waitFor(() => {
      const interactables = result.current.interactable.interactableComponents;
      expect(interactables.length).toBeGreaterThan(0);
      expect(interactables[0].name).toBe("Note");
      expect(interactables[0].props).toEqual({
        title: "My Note",
        content: "Note content",
      });
    });
  });

  it("should not add components when autoInteractables is disabled", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={noteComponents}
        autoInteractables={false}
      >
        {children}
      </TamboProvider>
    );

    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        dispatch: useStreamDispatch(),
      }),
      { wrapper },
    );

    result.current.dispatch({
      type: "INIT_THREAD",
      threadId: "test-thread-1",
    });

    result.current.dispatch({
      type: "ADD_MESSAGE",
      threadId: "test-thread-1",
      message: {
        id: "msg-1",
        role: "assistant",
        content: [
          {
            type: "component",
            id: "comp-1",
            name: "Note",
            props: { title: "My Note", content: "Note content" },
            streamingState: "complete",
          },
        ],
      },
    });

    await waitFor(() => {
      expect(result.current.interactable.interactableComponents).toHaveLength(
        0,
      );
    });
  });

  it("should add multiple components from different messages", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={noteComponents}
        autoInteractables={true}
      >
        {children}
      </TamboProvider>
    );

    const { result } = renderHook(
      () => ({
        interactable: useTamboInteractable(),
        dispatch: useStreamDispatch(),
      }),
      { wrapper },
    );

    result.current.dispatch({
      type: "INIT_THREAD",
      threadId: "test-thread-1",
    });

    result.current.dispatch({
      type: "ADD_MESSAGE",
      threadId: "test-thread-1",
      message: {
        id: "msg-1",
        role: "assistant",
        content: [
          {
            type: "component",
            id: "comp-1",
            name: "Note",
            props: { title: "Note 1", content: "First note" },
            streamingState: "complete",
          },
        ],
      },
    });

    result.current.dispatch({
      type: "ADD_MESSAGE",
      threadId: "test-thread-1",
      message: {
        id: "msg-2",
        role: "assistant",
        content: [
          {
            type: "component",
            id: "comp-2",
            name: "Note",
            props: { title: "Note 2", content: "Second note" },
            streamingState: "complete",
          },
        ],
      },
    });

    await waitFor(() => {
      expect(result.current.interactable.interactableComponents.length).toBe(2);
    });

    const interactables = result.current.interactable.interactableComponents;
    expect(interactables[0].props.title).toBe("Note 1");
    expect(interactables[1].props.title).toBe("Note 2");
  });
});
