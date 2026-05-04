# Auto-Add Components to Interactables - Example

This example demonstrates the new `autoAddComponentsToInteractables` prop for `TamboProvider`.

## Before (Manual Interactables)

```tsx
import { TamboProvider, withTamboInteractable } from '@tambo-ai/react';
import { z } from 'zod';

// Must manually wrap component with withTamboInteractable
const Note = ({ title, content }: { title: string; content: string }) => (
  <div>
    <h2>{title}</h2>
    <p>{content}</p>
  </div>
);

const InteractableNote = withTamboInteractable(Note, {
  componentName: "Note",
  description: "A note component",
  propsSchema: z.object({
    title: z.string(),
    content: z.string(),
  }),
});

function App() {
  return (
    <TamboProvider
      apiKey={process.env.NEXT_PUBLIC_TAMBO_API_KEY!}
      components={[
        {
          name: "Note",
          description: "A note component",
          component: Note,
          propsSchema: z.object({
            title: z.string(),
            content: z.string(),
          }),
        },
      ]}
    >
      {/* Must manually render InteractableNote */}
      <InteractableNote title="My Note" content="Content here" />
    </TamboProvider>
  );
}
```

## After (Automatic Interactables)

```tsx
import { TamboProvider } from '@tambo-ai/react';
import { z } from 'zod';

// Regular component - no HOC needed
const Note = ({ title, content }: { title: string; content: string }) => (
  <div>
    <h2>{title}</h2>
    <p>{content}</p>
  </div>
);

function App() {
  return (
    <TamboProvider
      apiKey={process.env.NEXT_PUBLIC_TAMBO_API_KEY!}
      components={[
        {
          name: "Note",
          description: "A note component",
          component: Note,
          propsSchema: z.object({
            title: z.string(),
            content: z.string(),
          }),
        },
      ]}
      autoAddComponentsToInteractables={true} // Enable auto-add!
    >
      <Chat />
      {/* Any Note components rendered by the AI automatically become interactable */}
    </TamboProvider>
  );
}
```

## How It Works

When `autoAddComponentsToInteractables` is set to `true`:

1. Every component rendered by the AI is automatically registered as an interactable
2. The AI can update these components through subsequent requests
3. You can show the list of interactables instead of thread messages
4. No need to manually wrap components with `withTamboInteractable`

## Viewing Interactables

```tsx
import { useTamboInteractable } from '@tambo-ai/react';

function InteractablesList() {
  const { interactableComponents } = useTamboInteractable();

  return (
    <div>
      <h2>Current Interactables ({interactableComponents.length})</h2>
      {interactableComponents.map((comp) => (
        <div key={comp.id}>
          <h3>{comp.name}</h3>
          <ComponentRenderer component={comp.component} props={comp.props} />
        </div>
      ))}
    </div>
  );
}
```

## Use Cases

This is particularly useful for:
- **Dynamic dashboards** - AI generates charts/cards that can be updated
- **Task boards** - AI creates tasks that can be modified
- **Shopping carts** - AI adds items that can be adjusted
- **Note-taking apps** - AI creates notes that can be edited
- **Any scenario where you want generated components to persist and update**
