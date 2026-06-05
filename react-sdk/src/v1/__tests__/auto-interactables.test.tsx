/**
 * Auto-Interactables Integration Tests
 *
 * Tests for the autoInteractable feature that automatically adds generated
 * components to the interactable registry.
 */

import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { z } from "zod";
import { TamboProvider } from "../providers/tambo-v1-provider";
import { useTamboInteractable } from "../../providers/tambo-interactable-provider";
import { useTambo } from "../hooks/use-tambo-v1";
import type { TamboComponent } from "../../model/component-metadata";

// Mock component for testing
function TestCard({ title, count }: { title: string; count: number }) {
  return (
    <div>
      <h1>{title}</h1>
      <p>Count: {count}</p>
    </div>
  );
}

const TestCardSchema = z.object({
  title: z.string(),
  count: z.number(),
});

const testComponents: TamboComponent[] = [
  {
    name: "TestCard",
    description: "A test card component",
    component: TestCard,
    propsSchema: TestCardSchema,
  },
];

describe("Auto-Interactables", () => {
  it("should not add components to interactables when autoInteractable is false", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={testComponents}
        autoInteractable={false}
      >
        {children}
      </TamboProvider>
    );

    const { result } = renderHook(
      () => ({
        tambo: useTambo(),
        interactable: useTamboInteractable(),
      }),
      { wrapper },
    );

    // Should start with no interactables
    expect(result.current.interactable.interactableComponents).toHaveLength(0);
  });

  it("should not add components to interactables when autoInteractable is undefined (default)", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TamboProvider
        apiKey="test-key"
        userKey="test-user"
        components={testComponents}
      >
        {children}
      </TamboProvider>
    );

    const { result } = renderHook(
      () => ({
        tambo: useTambo(),
        interactable: useTamboInteractable(),
      }),
      { wrapper },
    );

    // Should start with no interactables
    expect(result.current.interactable.interactableComponents).toHaveLength(0);
  });
});
