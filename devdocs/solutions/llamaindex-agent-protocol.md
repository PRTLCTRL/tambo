# LlamaIndex Agent Protocol Documentation

## Overview

When using the LlamaIndex provider with a custom Agent URL in Tambo Cloud, your endpoint must implement the AG-UI (Agent-User Interaction) protocol. This document explains the exact contract required for successful integration.

## Problem

Users report consistent failures when using custom Agent URLs with the LlamaIndex provider:

- `INTERNAL_ERROR: An internal error occurred`
- `Error in input stream`

Even when their endpoints return HTTP 200 and valid streaming responses, the integration fails because the stream format doesn't match the expected AG-UI protocol.

## Root Cause

The `LlamaIndexAgent` class (from `@ag-ui/llamaindex` package) extends `HttpAgent`, which expects Server-Sent Events (SSE) in a specific AG-UI protocol format. If your endpoint returns:

- Raw SSE passthrough (standard `data: ...` events without AG-UI structure)
- OpenAI-style streaming (e.g., `chat.completion.chunk`)
- Plain JSON responses
- Any other format

...the `HttpAgent` will fail to parse the events, throwing errors that get classified as `INTERNAL_ERROR`.

## Solution: Implement AG-UI Protocol

### 1. Request Format

Your endpoint receives a POST request with:

**Headers:**

```
Content-Type: application/json
Authorization: <value from your Agent URL headers config>
```

**Body:**

```json
{
  "messages": [
    {
      "role": "user",
      "content": "Hello, how can you help me?",
      "id": "msg-123"
    },
    {
      "role": "assistant",
      "content": "I can help with many tasks!",
      "id": "msg-124",
      "toolCalls": [] // Optional, for tool-calling assistants
    }
  ],
  "tools": [
    {
      "name": "search",
      "description": "Search the knowledge base",
      "parameters": {
        "type": "object",
        "properties": {
          "query": { "type": "string" }
        },
        "required": ["query"]
      }
    }
  ],
  "runId": "run-abc123", // Unique identifier for this run
  "context": {} // Optional additional context
}
```

### 2. Response Format: Server-Sent Events (SSE)

Your endpoint MUST return a stream of Server-Sent Events with `Content-Type: text/event-stream`.

**Required SSE Structure:**

Each event must be valid AG-UI protocol JSON:

```
data: {"type":"RUN_STARTED",...}

data: {"type":"TEXT_MESSAGE_START","messageId":"msg-125","role":"assistant"}

data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"msg-125","delta":"Hello"}

data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"msg-125","delta":" there!"}

data: {"type":"TEXT_MESSAGE_END","messageId":"msg-125"}

data: {"type":"RUN_FINISHED","result":"Conversation completed"}


```

Note: Two newlines (`\n\n`) terminate each SSE event.

### 3. AG-UI Event Types

Your stream must emit these events in order:

#### a. Start the run

```json
{
  "type": "RUN_STARTED"
}
```

#### b. Start a text message

```json
{
  "type": "TEXT_MESSAGE_START",
  "messageId": "msg-125",
  "role": "assistant"
}
```

#### c. Stream message content (multiple chunks)

```json
{
  "type": "TEXT_MESSAGE_CONTENT",
  "messageId": "msg-125",
  "delta": "chunk of text"
}
```

Or use `TEXT_MESSAGE_CHUNK` (alias for `TEXT_MESSAGE_CONTENT`):

```json
{
  "type": "TEXT_MESSAGE_CHUNK",
  "messageId": "msg-125",
  "delta": "chunk of text"
}
```

#### d. End the text message

```json
{
  "type": "TEXT_MESSAGE_END",
  "messageId": "msg-125"
}
```

#### e. Finish the run

```json
{
  "type": "RUN_FINISHED",
  "result": "Conversation completed successfully"
}
```

### 4. Tool Call Events (Optional)

If your agent needs to call tools, emit these events:

```json
{
  "type": "TOOL_CALL_START",
  "toolCallId": "call-001",
  "toolCallName": "search",
  "parentMessageId": "msg-125"
}
```

```json
{
  "type": "TOOL_CALL_ARGS",
  "toolCallId": "call-001",
  "delta": "{\"query\":\"example\"}"
}
```

```json
{
  "type": "TOOL_CALL_END",
  "toolCallId": "call-001"
}
```

### 5. Error Events

If an error occurs during execution:

```json
{
  "type": "RUN_ERROR",
  "message": "Failed to process request",
  "code": "AGENT_ERROR"
}
```

This will be propagated to the client as a streaming error.

### 6. Complete Minimal Example

**Request:** `POST https://your-agent.example.com/agent`

**Response:**

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: {"type":"RUN_STARTED"}

data: {"type":"TEXT_MESSAGE_START","messageId":"msg-001","role":"assistant"}

data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"msg-001","delta":"Hello"}

data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"msg-001","delta":" from"}

data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"msg-001","delta":" LlamaIndex!"}

data: {"type":"TEXT_MESSAGE_END","messageId":"msg-001"}

data: {"type":"RUN_FINISHED","result":"done"}


```

## Common Mistakes

### ❌ Wrong: OpenAI-style streaming

```
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","choices":[...]}
```

This will fail because it's not AG-UI protocol.

### ❌ Wrong: Raw text passthrough

```
data: Hello from my agent!
```

This will fail because it's missing AG-UI event structure.

### ❌ Wrong: Non-streaming JSON

```json
{
  "response": "Hello from my agent!"
}
```

This will fail because LlamaIndex provider expects SSE, not JSON.

### ❌ Wrong: Missing message IDs

```json
{
  "type": "TEXT_MESSAGE_CONTENT",
  "delta": "Hello"
}
```

This will fail because `messageId` is required.

### ✅ Correct: Full AG-UI protocol events

```
data: {"type":"TEXT_MESSAGE_START","messageId":"msg-001","role":"assistant"}

data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"msg-001","delta":"Hello"}
```

## Stream Termination

The stream should end naturally after emitting `RUN_FINISHED`. You can:

1. Close the connection
2. Stop sending events

Do NOT send `data: [DONE]` or any other termination marker — the `RUN_FINISHED` event signals completion.

## Testing Your Endpoint

Use `curl` to verify your endpoint returns valid AG-UI SSE:

```bash
curl -X POST https://your-agent.example.com/agent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{
    "messages": [{"role": "user", "content": "Hello", "id": "test-1"}],
    "tools": [],
    "runId": "test-run"
  }' \
  --no-buffer
```

Expected output:

```
data: {"type":"RUN_STARTED"}

data: {"type":"TEXT_MESSAGE_START","messageId":"msg-001","role":"assistant"}
...
```

## Alternative: Use a Different Provider

If implementing AG-UI protocol is too complex, consider:

1. **PydanticAI provider** - Also uses AG-UI protocol, same requirements
2. **Mastra provider** - Uses Mastra's own protocol
3. **OpenAI-compatible provider** - If your endpoint follows OpenAI's chat completions API, use provider="openai-compatible" instead of agent mode

## Reference

- AG-UI Protocol: https://github.com/AgentGameFramework/ag-ui (check their documentation)
- HttpAgent source: `@ag-ui/client` package
- LlamaIndexAgent source: `@ag-ui/llamaindex` package

## Need Help?

If you're still experiencing issues:

1. Verify your endpoint returns `Content-Type: text/event-stream`
2. Check that each event starts with `data: ` and ends with `\n\n`
3. Validate your JSON is parseable (use `JSON.parse()` on each event)
4. Ensure all required fields (`type`, `messageId`, `role`) are present
5. Check Tambo Cloud API logs for the specific parsing error

Open an issue at https://github.com/tambo-ai/tambo/issues with:

- Your endpoint's SSE output (captured with `curl`)
- The exact error message from Tambo Cloud
- Your Agent URL configuration
