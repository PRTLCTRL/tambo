/**
 * Auto-Interactables Demo
 *
 * This example shows how to use the autoAddComponentsToInteractables prop
 * to automatically make all generated components updatable by the AI.
 */

import React, { useState } from "react";
import { z } from "zod";
import {
  TamboProvider,
  useTambo,
  useTamboThreadInput,
  useTamboInteractable,
  ComponentRenderer,
  type TamboComponent,
} from "@tambo-ai/react";

// Simple Note component
const Note = ({ title, content, color }: { title: string; content: string; color?: string }) => {
  return (
    <div
      style={{
        border: "2px solid #ccc",
        borderRadius: "8px",
        padding: "16px",
        margin: "8px 0",
        backgroundColor: color || "#fff",
      }}
    >
      <h3>{title}</h3>
      <p>{content}</p>
    </div>
  );
};

// Register the component with Tambo
const components: TamboComponent[] = [
  {
    name: "Note",
    description: "A note component with title, content, and optional color",
    component: Note,
    propsSchema: z.object({
      title: z.string().describe("The title of the note"),
      content: z.string().describe("The content/body of the note"),
      color: z.string().optional().describe("Background color (hex or named color)"),
    }),
  },
];

function InteractablesList() {
  const { interactableComponents } = useTamboInteractable();

  if (interactableComponents.length === 0) {
    return null;
  }

  return (
    <div style={{ marginTop: "24px", padding: "16px", backgroundColor: "#f5f5f5" }}>
      <h2>Current Interactables</h2>
      <p>The AI can see and update these components:</p>
      <ul>
        {interactableComponents.map((component) => (
          <li key={component.id}>
            <strong>{component.id}</strong> ({component.name})
            <pre style={{ fontSize: "12px", marginTop: "4px" }}>
              {JSON.stringify(component.props, null, 2)}
            </pre>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChatInterface() {
  const { messages, isStreaming } = useTambo();
  const { value, setValue, submit, isPending } = useTamboThreadInput();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    await submit();
  };

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "24px" }}>
      <h1>Auto-Interactables Demo</h1>
      <p>
        Try: "Create a note about TypeScript" then "Change its color to blue" or "Update the
        content"
      </p>

      {/* Messages */}
      <div style={{ marginTop: "24px" }}>
        {messages.map((message) => (
          <div key={message.id} style={{ marginBottom: "16px" }}>
            <strong>{message.role}:</strong>
            {message.content.map((content, idx) => {
              if (content.type === "text") {
                return (
                  <p key={idx} style={{ marginLeft: "8px" }}>
                    {content.text}
                  </p>
                );
              }
              if (content.type === "component") {
                return (
                  <ComponentRenderer
                    key={content.id}
                    content={content}
                    threadId={message.id}
                    messageId={message.id}
                  />
                );
              }
              return null;
            })}
          </div>
        ))}
        {isStreaming && <div>AI is typing...</div>}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} style={{ marginTop: "24px" }}>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Type your message..."
          style={{
            width: "100%",
            padding: "12px",
            fontSize: "16px",
            border: "2px solid #ccc",
            borderRadius: "4px",
          }}
          disabled={isPending}
        />
        <button
          type="submit"
          disabled={isPending || !value.trim()}
          style={{
            marginTop: "12px",
            padding: "12px 24px",
            fontSize: "16px",
            backgroundColor: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Send
        </button>
      </form>

      {/* Show current interactables */}
      <InteractablesList />
    </div>
  );
}

export function AutoInteractablesDemo() {
  return (
    <TamboProvider
      apiKey={process.env.NEXT_PUBLIC_TAMBO_API_KEY!}
      userKey="demo-user"
      components={components}
      autoAddComponentsToInteractables={true} // 👈 This is the new prop!
    >
      <ChatInterface />
    </TamboProvider>
  );
}
