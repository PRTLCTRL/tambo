import { render, waitFor } from "@testing-library/react";
import React from "react";
import { TamboProvider } from "./tambo-v1-provider";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import { useStreamDispatch } from "./tambo-v1-stream-context";
import { z } from "zod/v3";

// Test component
const TestComponent: React.FC<{ message: string }> = ({ message }) => {
  return <div>{message}</div>;
};

// Component for extracting interactables
const InteractablesExtractor = ({ onExtract }: { onExtract: (count: number) => void }) => {
  const { interactableComponents } = useTamboInteractable();
  React.useEffect(() => {
    onExtract(interactableComponents.length);
  }, [interactableComponents.length, onExtract]);
  return null;
};

// Component for dispatching events
const EventDispatcher = ({ events }: { events: any[] }) => {
  const dispatch = useStreamDispatch();
  React.useEffect(() => {
    for (const event of events) {
      dispatch(event);
    }
  }, [events, dispatch]);
  return null;
};

describe("AutoInteractables", () => {
  it("should automatically add components when autoInteractables is enabled", async () => {
    let interactableCount = 0;
    const handleExtract = (count: number) => {
      interactableCount = count;
    };

    const events = [
      {
        type: "EVENT" as const,
        threadId: "test-thread",
        event: {
          type: "message.content.component.started" as const,
          componentId: "comp-1",
          componentName: "TestComponent",
          messageId: "msg-1",
        },
      },
      {
        type: "EVENT" as const,
        threadId: "test-thread",
        event: {
          type: "message.content.component.done" as const,
          componentId: "comp-1",
          props: { message: "Hello World" },
          messageId: "msg-1",
        },
      },
    ];

    render(
      <TamboProvider
        apiKey="test-key"
        components={[
          {
            name: "TestComponent",
            description: "A test component",
            component: TestComponent,
            props: z.object({ message: z.string() }),
          },
        ]}
        autoInteractables={true}
      >
        <EventDispatcher events={events} />
        <InteractablesExtractor onExtract={handleExtract} />
      </TamboProvider>,
    );

    await waitFor(
      () => {
        expect(interactableCount).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );
  });

  it("should NOT add components when autoInteractables is disabled", async () => {
    let interactableCount = 0;
    const handleExtract = (count: number) => {
      interactableCount = count;
    };

    const events = [
      {
        type: "EVENT" as const,
        threadId: "test-thread",
        event: {
          type: "message.content.component.started" as const,
          componentId: "comp-1",
          componentName: "TestComponent",
          messageId: "msg-1",
        },
      },
      {
        type: "EVENT" as const,
        threadId: "test-thread",
        event: {
          type: "message.content.component.done" as const,
          componentId: "comp-1",
          props: { message: "Hello World" },
          messageId: "msg-1",
        },
      },
    ];

    render(
      <TamboProvider
        apiKey="test-key"
        components={[
          {
            name: "TestComponent",
            description: "A test component",
            component: TestComponent,
            props: z.object({ message: z.string() }),
          },
        ]}
        autoInteractables={false}
      >
        <EventDispatcher events={events} />
        <InteractablesExtractor onExtract={handleExtract} />
      </TamboProvider>,
    );

    // Wait a bit to ensure components are not added
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(interactableCount).toBe(0);
  });

  it("should not add duplicate components", async () => {
    let interactableCount = 0;
    const handleExtract = (count: number) => {
      interactableCount = count;
    };

    // Same event dispatched twice
    const events = [
      {
        type: "EVENT" as const,
        threadId: "test-thread",
        event: {
          type: "message.content.component.started" as const,
          componentId: "comp-1",
          componentName: "TestComponent",
          messageId: "msg-1",
        },
      },
      {
        type: "EVENT" as const,
        threadId: "test-thread",
        event: {
          type: "message.content.component.done" as const,
          componentId: "comp-1",
          props: { message: "Hello World" },
          messageId: "msg-1",
        },
      },
    ];

    render(
      <TamboProvider
        apiKey="test-key"
        components={[
          {
            name: "TestComponent",
            description: "A test component",
            component: TestComponent,
            props: z.object({ message: z.string() }),
          },
        ]}
        autoInteractables={true}
      >
        <EventDispatcher events={events} />
        <EventDispatcher events={events} />
        <InteractablesExtractor onExtract={handleExtract} />
      </TamboProvider>,
    );

    await waitFor(
      () => {
        expect(interactableCount).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );

    // Should only have one component, not two
    expect(interactableCount).toBe(1);
  });
});
