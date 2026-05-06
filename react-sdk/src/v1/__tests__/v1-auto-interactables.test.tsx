import { renderHook } from "@testing-library/react";
import React from "react";
import { z } from "zod/v3";
import TamboAI from "@tambo-ai/typescript-sdk";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useTamboClient,
  useTamboQueryClient,
} from "../../providers/tambo-client-provider";
import { TamboProvider, useTamboConfig } from "../providers/tambo-v1-provider";

// Module-level QueryClient for tests - created lazily
let testQueryClient: QueryClient | null = null;

// Mock the client provider to avoid fetch errors
jest.mock("../../providers/tambo-client-provider", () => {
  return {
    useTamboClient: jest.fn(),
    useTamboQueryClient: jest.fn(),
    TamboClientProvider: jest.fn(
      ({ children }: { children: React.ReactNode }) => children,
    ),
  };
});

// Mock MCP providers to avoid TamboClientContext dependency
jest.mock("../../providers/tambo-mcp-token-provider", () => ({
  TamboMcpTokenProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

jest.mock("../../mcp/tambo-mcp-provider", () => ({
  TamboMcpProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock auth state to avoid TamboClientContext dependency
jest.mock("../hooks/use-tambo-v1-auth-state", () => ({
  useTamboAuthState: () => ({
    status: "identified",
    source: "userKey",
  }),
}));

// Mock useTamboSendMessage to avoid complex dependencies
jest.mock("../hooks/use-tambo-v1-send-message", () => ({
  useTamboSendMessage: jest.fn(() => ({
    mutateAsync: jest.fn(),
    mutate: jest.fn(),
    isPending: false,
    isError: false,
    error: null,
    isSuccess: false,
    reset: jest.fn(),
  })),
}));

const TestWidget: React.FC<{ label: string }> = ({ label }) => (
  <div>{label}</div>
);

const TestCard: React.FC<{ title: string; content: string }> = ({
  title,
  content,
}) => (
  <div>
    <h1>{title}</h1>
    <p>{content}</p>
  </div>
);

const mockFetch: typeof fetch = async (..._args) => {
  throw new Error("fetch not implemented");
};

const mockClient = new TamboAI({
  apiKey: "test-api-key",
  fetch: mockFetch,
});

function TestWrapper({
  children,
  autoAddComponentsToInteractables = false,
}: {
  children: React.ReactNode;
  autoAddComponentsToInteractables?: boolean;
}) {
  return (
    <TamboProvider
      apiKey="test-key"
      userKey="test-user"
      autoAddComponentsToInteractables={autoAddComponentsToInteractables}
      components={[
        {
          name: "TestWidget",
          description: "A test widget",
          component: TestWidget,
          propsSchema: z.object({ label: z.string() }),
        },
        {
          name: "TestCard",
          description: "A test card",
          component: TestCard,
          propsSchema: z.object({
            title: z.string(),
            content: z.string(),
          }),
        },
      ]}
    >
      {children}
    </TamboProvider>
  );
}

describe("Auto Interactables", () => {
  beforeEach(() => {
    // Create a fresh QueryClient for each test
    testQueryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    jest.mocked(useTamboClient).mockReturnValue(mockClient);
    jest.mocked(useTamboQueryClient).mockReturnValue(testQueryClient);

    // Mock TamboClientProvider to wrap children with QueryClientProvider
    const { TamboClientProvider } = jest.requireMock(
      "../../providers/tambo-client-provider",
    );
    jest
      .mocked(TamboClientProvider)
      .mockImplementation(({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={testQueryClient!}>
          {children}
        </QueryClientProvider>
      ));
  });

  it("should provide access to autoAddComponentsToInteractables config", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TestWrapper autoAddComponentsToInteractables={true}>
        {children}
      </TestWrapper>
    );

    const { result } = renderHook(() => useTamboConfig(), { wrapper });

    expect(result.current.autoAddComponentsToInteractables).toBe(true);
  });

  it("should allow autoAddComponentsToInteractables to be disabled", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <TestWrapper autoAddComponentsToInteractables={false}>
        {children}
      </TestWrapper>
    );

    const { result } = renderHook(() => useTamboConfig(), { wrapper });

    expect(result.current.autoAddComponentsToInteractables).toBe(false);
  });
});
