import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { z } from "zod";
import { TamboInteractableProvider } from "../../providers/tambo-interactable-provider";
import { TamboRegistryProvider } from "../../providers/tambo-registry-provider";
import { TamboContextHelpersProvider } from "../../providers/tambo-context-helpers-provider";
import type { TamboComponentContent } from "../types/message";
import { TamboConfigContext } from "../providers/tambo-v1-provider";
import { ComponentRenderer } from "./v1-component-renderer";

const TestComponent: React.FC<{ title: string; count: number }> = ({
  title,
  count,
}) => (
  <div>
    <h1>{title}</h1>
    <span data-testid="count">{count}</span>
  </div>
);

describe("ComponentRenderer - Auto Register Interactables", () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const testComponentSchema = z.object({
    title: z.string(),
    count: z.number(),
  });

  const testComponents = [
    {
      name: "TestComponent",
      description: "A test component for auto-registration",
      component: TestComponent,
      propsDefinition: testComponentSchema,
    },
  ];

  const testContent: TamboComponentContent = {
    type: "component" as const,
    id: "test-component-1",
    name: "TestComponent",
    props: { title: "Hello", count: 5 },
    state: {},
  };

  it("automatically registers component as interactable when enabled", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <TamboRegistryProvider components={testComponents}>
          <TamboContextHelpersProvider>
            <TamboConfigContext.Provider
              value={{ autoRegisterGeneratedComponentsAsInteractables: true }}
            >
              <TamboInteractableProvider>{children}</TamboInteractableProvider>
            </TamboConfigContext.Provider>
          </TamboContextHelpersProvider>
        </TamboRegistryProvider>
      </QueryClientProvider>
    );

    render(
      <ComponentRenderer
        content={testContent}
        threadId="thread-1"
        messageId="msg-1"
      />,
      { wrapper },
    );

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });
  });

  it("does not auto-register when setting is disabled", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <TamboRegistryProvider components={testComponents}>
          <TamboContextHelpersProvider>
            <TamboConfigContext.Provider
              value={{ autoRegisterGeneratedComponentsAsInteractables: false }}
            >
              <TamboInteractableProvider>{children}</TamboInteractableProvider>
            </TamboConfigContext.Provider>
          </TamboContextHelpersProvider>
        </TamboRegistryProvider>
      </QueryClientProvider>
    );

    render(
      <ComponentRenderer
        content={testContent}
        threadId="thread-1"
        messageId="msg-1"
      />,
      { wrapper },
    );

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });
  });

  it("does not auto-register when setting is undefined (defaults to false)", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <TamboRegistryProvider components={testComponents}>
          <TamboContextHelpersProvider>
            <TamboConfigContext.Provider value={{}}>
              <TamboInteractableProvider>{children}</TamboInteractableProvider>
            </TamboConfigContext.Provider>
          </TamboContextHelpersProvider>
        </TamboRegistryProvider>
      </QueryClientProvider>
    );

    render(
      <ComponentRenderer
        content={testContent}
        threadId="thread-1"
        messageId="msg-1"
      />,
      { wrapper },
    );

    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });
  });
});
