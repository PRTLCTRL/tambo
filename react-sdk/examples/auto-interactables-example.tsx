/**
 * Example: Automatic Interactables
 *
 * This example demonstrates how to enable automatic interactable registration.
 * When `autoAddToInteractables` is enabled, all AI-generated components are
 * automatically added to the interactables registry, allowing the AI to update
 * previously-generated components instead of always creating new ones.
 */

import React from "react";
import { z } from "zod";
import { TamboProvider } from "@tambo-ai/react";
import { useTamboInteractable } from "@tambo-ai/react";

// Define your components
const Note: React.FC<{ title: string; content: string; color?: string }> = ({
  title,
  content,
  color = "white",
}) => (
  <div style={{ border: "1px solid gray", padding: "1rem", background: color }}>
    <h2>{title}</h2>
    <p>{content}</p>
  </div>
);

const components = [
  {
    name: "Note",
    description: "A simple note component that can be updated",
    component: Note,
    propsSchema: z.object({
      title: z.string(),
      content: z.string(),
      color: z.enum(["white", "yellow", "blue", "green"]).optional(),
    }),
  },
];

// Component to display all interactable components
const InteractablesList: React.FC = () => {
  const { interactableComponents } = useTamboInteractable();

  return (
    <div>
      <h2>Current Interactable Components ({interactableComponents.length})</h2>
      <ul>
        {interactableComponents.map((comp) => (
          <li key={comp.id}>
            {comp.name} - {comp.id}
            <br />
            Props: {JSON.stringify(comp.props)}
          </li>
        ))}
      </ul>
    </div>
  );
};

// Main app with autoAddToInteractables enabled
export const AutoInteractablesApp: React.FC = () => {
  return (
    <TamboProvider
      apiKey={process.env.NEXT_PUBLIC_TAMBO_API_KEY!}
      userKey="demo-user"
      components={components}
      autoAddToInteractables={true} // Enable automatic interactables
    >
      <div style={{ display: "flex", gap: "2rem" }}>
        <div style={{ flex: 1 }}>
          <h1>Chat Interface</h1>
          {/* Your chat interface here */}
          <p>
            Try asking: "Create a note with title 'My Note' and content 'Hello
            World'"
          </p>
          <p>
            Then try: "Update the note to have a yellow background" - The AI
            will update the existing note instead of creating a new one!
          </p>
        </div>

        <div style={{ flex: 1, borderLeft: "1px solid gray", paddingLeft: "2rem" }}>
          <InteractablesList />
        </div>
      </div>
    </TamboProvider>
  );
};

// App WITHOUT automatic interactables (default behavior)
export const ManualInteractablesApp: React.FC = () => {
  return (
    <TamboProvider
      apiKey={process.env.NEXT_PUBLIC_TAMBO_API_KEY!}
      userKey="demo-user"
      components={components}
      autoAddToInteractables={false} // Default: disabled
    >
      <div>
        <h1>Manual Interactables (Default)</h1>
        <p>
          Components are NOT automatically added to interactables. You must use
          `withTamboInteractable` HOC to make components interactable.
        </p>
        <InteractablesList />
      </div>
    </TamboProvider>
  );
};
