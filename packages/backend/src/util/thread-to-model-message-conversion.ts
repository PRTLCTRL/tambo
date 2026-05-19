import {
  ChatCompletionContentPart,
  ContentPartType,
  MessageRole,
  Resource,
  ThreadMessage,
  stringifyJsonForMarkupText,
  tryParseJson,
} from "@tambo-ai-cloud/core";
import type {
  AssistantModelMessage,
  ModelMessage,
  TextPart,
  ToolCallPart,
  ToolContent,
  ToolResultPart,
  UserContent,
  UserModelMessage,
} from "ai";
import type { ProviderOptions } from "@ai-sdk/provider-utils";
import * as mimeTypes from "mime-types";
import { formatFunctionCall, generateAdditionalContext } from "./tools";

function getToolCallProviderOptions(
  message: ThreadMessage,
  toolCallId: string,
): ProviderOptions | undefined {
  const metadata = message.metadata;
  if (!metadata) {
    return undefined;
  }

  const tamboMetadata = metadata["_tambo"];
  if (typeof tamboMetadata !== "object" || tamboMetadata === null) {
    return undefined;
  }

  const toolCallProviderOptionsById = (
    tamboMetadata as Record<string, unknown>
  )["toolCallProviderOptionsById"];
  if (
    typeof toolCallProviderOptionsById !== "object" ||
    toolCallProviderOptionsById === null
  ) {
    return undefined;
  }

  const providerOptions = (
    toolCallProviderOptionsById as Record<string, unknown>
  )[toolCallId];
  if (typeof providerOptions !== "object" || providerOptions === null) {
    return undefined;
  }

  const googleProviderOptions = (providerOptions as Record<string, unknown>)[
    "google"
  ];
  if (googleProviderOptions !== undefined) {
    if (
      typeof googleProviderOptions !== "object" ||
      googleProviderOptions === null
    ) {
      return undefined;
    }

    const thoughtSignature = (googleProviderOptions as Record<string, unknown>)[
      "thoughtSignature"
    ];
    if (
      thoughtSignature !== undefined &&
      typeof thoughtSignature !== "string"
    ) {
      return undefined;
    }
  }

  return providerOptions as ProviderOptions;
}

/**
 * Directly convert ThreadMessage[] to AI SDK ModelMessage[] format.
 * This bypasses the OpenAI intermediate layer and consolidates all
 * conversion logic in one place.
 *
 * @param messages - Array of ThreadMessages to convert
 * @param isSupportedMimeType - Predicate to check if provider supports a MIME type
 * @returns Array of AI SDK ModelMessages
 */
export function threadMessagesToModelMessages(
  messages: ThreadMessage[],
  isSupportedMimeType: (mimeType: string) => boolean,
): ModelMessage[] {
  // Track which tool call IDs have been responded to (same logic as thread-message-conversion.ts:29-34)
  const respondedToolIds: string[] = messages
    .filter(
      (message) => message.role === MessageRole.Tool && message.tool_call_id,
    )
    .map((message) => message.tool_call_id)
    .filter((id): id is string => id !== undefined);

  // Convert each message, handling all the complex cases
  const modelMessages: ModelMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const nextMessage = i + 1 < messages.length ? messages[i + 1] : undefined;

    switch (message.role) {
      case MessageRole.Tool: {
        const converted = convertToolMessage(message, messages.slice(0, i));
        if (converted) {
          modelMessages.push(converted);
        }
        break;
      }
      case MessageRole.Assistant: {
        const converted = convertAssistantMessage(
          message,
          respondedToolIds,
          isSupportedMimeType,
          nextMessage,
        );
        modelMessages.push(...converted);
        break;
      }
      case MessageRole.User:
      case MessageRole.System: {
        const converted = convertUserOrSystemMessage(
          message,
          isSupportedMimeType,
        );
        modelMessages.push(converted);
        break;
      }
      default: {
        // Exhaustiveness check - TypeScript will error if we miss a case
        const _exhaustive: never = message;
        throw new Error(
          `Unknown message role: ${(_exhaustive as ThreadMessage).role}`,
        );
      }
    }
  }

  return modelMessages;
}

/**
 * Convert a tool message to AI SDK ToolResultPart format
 */
function convertToolMessage(
  message: ThreadMessage,
  previousMessages: ThreadMessage[],
): ModelMessage | null {
  if (!message.tool_call_id) {
    console.warn(
      `no tool id in tool message ${message.id}, skipping tool message`,
    );
    return null;
  }

  // Find the tool name from previous messages
  const toolName = findToolNameById(previousMessages, message.tool_call_id);
  if (!toolName) {
    console.warn(
      `Unable to find previous message for tool call ${message.tool_call_id}`,
    );
    return null;
  }

  // Convert content to tool result format
  const content: ToolContent = message.content
    .map((part): ToolResultPart | null => {
      switch (part.type) {
        case ContentPartType.Text:
          return {
            type: "tool-result",
            output: {
              type: "text",
              value: part.text,
            },
            toolCallId: message.tool_call_id!,
            toolName,
          } satisfies ToolResultPart;
        case ContentPartType.ImageUrl:
          return {
            type: "tool-result",
            output: {
              type: "content",
              value: [
                {
                  type: "media",
                  data: part.image_url.url.split(",")[1],
                  mediaType: "image/jpeg",
                },
              ],
            },
            toolCallId: message.tool_call_id!,
            toolName,
          } satisfies ToolResultPart;
        default: {
          console.warn(
            `Unexpected content type in tool message ${
              message.id
            } (tool_call_id=${message.tool_call_id}, toolName=${toolName}): ${
              part.type
            }, skipping`,
          );
          return null;
        }
      }
    })
    .filter((part): part is ToolResultPart => part !== null);

  return {
    role: "tool",
    content,
  } satisfies ModelMessage;
}

/**
 * Find tool name by looking up the tool call ID in previous messages
 * Looks through previous ThreadMessages to find the assistant message that made the tool call
 */
function findToolNameById(
  previousMessages: ThreadMessage[],
  toolCallId: string,
): string | undefined {
  // Search backwards through messages to find the most recent assistant message with this tool call ID
  for (let i = previousMessages.length - 1; i >= 0; i--) {
    const msg = previousMessages[i];
    if (msg.role === MessageRole.Assistant && msg.tool_call_id === toolCallId) {
      // Check if this message has a toolCallRequest
      if (msg.toolCallRequest) {
        return msg.toolCallRequest.toolName;
      }
      // Also check component.toolCallRequest for backwards compatibility
      if (msg.component?.toolCallRequest) {
        return msg.component.toolCallRequest.toolName;
      }
    }
  }
  return undefined;
}

/**
 * Convert assistant messages, handling tool calls and component decisions
 * This is the most complex conversion with multiple cases
 */
export function convertAssistantMessage(
  message: ThreadMessage,
  respondedToolIds: string[],
  _isSupportedMimeType: (mimeType: string) => boolean,
  nextMessage?: ThreadMessage,
): ModelMessage[] {
  const toolCallRequest =
    message.toolCallRequest ?? message.component?.toolCallRequest;
  const toolCallId = message.tool_call_id ?? "";
  const hasToolCall = toolCallId && toolCallRequest;

  // Determine if this tool call has been responded to:
  // - Check if it's in the respondedToolIds list (already processed)
  // - Check if the next message is the tool result (will be processed)
  const isToolResponded = hasToolCall && respondedToolIds.includes(toolCallId);
  const isNextMessageToolResult =
    hasToolCall &&
    nextMessage?.role === MessageRole.Tool &&
    nextMessage.tool_call_id === toolCallId;

  // Build the regular assistant message with optional tool calls
  const content: (ToolCallPart | { type: "text"; text: string })[] = [];

  // Add text content from message.content
  // Note: message.component is UI metadata about what React component to render,
  // not the text content to send to the LLM. Always use message.content for the
  // actual text content.
  message.content.forEach((part) => {
    if (part.type === ContentPartType.Text && part.text.trim()) {
      content.push({ type: "text", text: part.text });
    }
  });

  // Add tool calls if present
  if (hasToolCall) {
    const toolCalls = formatFunctionCall(toolCallRequest, toolCallId);
    toolCalls.forEach((call) => {
      if (call.type === "function") {
        const providerOptions = getToolCallProviderOptions(message, call.id);
        content.push({
          type: "tool-call",
          toolCallId: call.id,
          toolName: call.function.name,
          input: tryParseJson(call.function.arguments),
          providerOptions,
        } satisfies ToolCallPart);
      }
    });
  }

  // Include component state so the LLM can see it on follow-up messages
  if (
    message.componentState &&
    Object.keys(message.componentState).length > 0
  ) {
    const safeJson = stringifyJsonForMarkupText(message.componentState);
    content.push({
      type: "text",
      text: `<component_state>${safeJson}</component_state>`,
    });
  }

  const assistantMessage: AssistantModelMessage = {
    role: "assistant",
    content,
  };

  // CRITICAL FIX for Anthropic Opus 4.6: Check if there's a tool call that hasn't been responded to.
  // Only add a fake tool_result if BOTH conditions are true:
  // 1. Tool call exists and hasn't been responded to (not in respondedToolIds)
  // 2. The next message is NOT the matching tool result
  //
  // This prevents Anthropic's "tool_use without tool_result" error when the tool result
  // is coming in the next message. Anthropic requires strict sequencing: each tool_use
  // must be immediately followed by its tool_result in the next message.
  if (hasToolCall && !isToolResponded && !isNextMessageToolResult) {
    console.warn(
      `tool message ${message.id} not responded to, adding fake tool_result (${toolCallId})`,
    );
    const toolName = toolCallRequest.toolName;
    return [
      assistantMessage,
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            output: { type: "text", value: "{}" },
            toolCallId,
            toolName,
          } satisfies ToolResultPart,
        ],
      } satisfies ModelMessage,
    ];
  }

  return [assistantMessage];
}

/**
 * Convert user or system messages to AI SDK format
 * Port from thread-message-conversion.ts:282-324 and ai-sdk-client.ts:759-770
 */
function convertUserOrSystemMessage(
  message: ThreadMessage,
  isSupportedMimeType: (mimeType: string) => boolean,
): ModelMessage {
  // System messages are handled specially - they use the convertToModelMessages function
  // which converts system messages to have a "system" role with string content
  if (message.role === MessageRole.System) {
    // Extract text from content parts
    const textContent = message.content
      .filter((part) => part.type === ContentPartType.Text)
      .map((part) => (part as { text: string }).text)
      .join("");

    // Return as system message with string content (matches old behavior)
    return {
      role: "system",
      content: textContent,
    };
  }

  // Generate additional context if present
  const additionalContextPart = generateAdditionalContext(message);

  // Convert content parts to AI SDK UserContent format
  // UserContent is Array<string | TextPart | FilePart | ImagePart>
  const contentParts: Array<Exclude<UserContent[number], string>> = [];

  // Add additional context first
  if (additionalContextPart) {
    contentParts.push({
      type: "text",
      text: additionalContextPart.text,
    });
  }

  // Add <User> wrapper for user messages (port from thread-message-conversion.ts:296-301)
  if (message.role === MessageRole.User) {
    contentParts.push({ type: "text", text: "<User>" });
  }

  // Convert each content part
  message.content.forEach((part) => {
    const converted = convertContentPartToUserContent(
      part,
      isSupportedMimeType,
    );
    if (converted !== null) {
      // Type assertion needed because UserContent includes strings but we know converted is not a string
      contentParts.push(converted as Exclude<UserContent[number], string>);
    }
  });

  // Close </User> wrapper for user messages
  if (message.role === MessageRole.User) {
    contentParts.push({ type: "text", text: "</User>" });
  }

  return {
    role: "user",
    content: contentParts,
  } satisfies UserModelMessage;
}

/**
 * Convert a single content part to AI SDK UserContent format
 * Port from ai-sdk-client.ts:784-877
 */
function convertContentPartToUserContent(
  part: ChatCompletionContentPart,
  isSupportedMimeType: (mimeType: string) => boolean,
): UserContent[number] | null {
  switch (part.type) {
    case ContentPartType.Text:
      return {
        type: "text",
        text: part.text,
      };

    case ContentPartType.ImageUrl:
      if (part.image_url.url) {
        return {
          type: "image",
          image: part.image_url.url,
        };
      }
      return null;

    case ContentPartType.Resource: {
      const resourceData = part.resource;

      // Handle binary resource content (blob)
      if (resourceData.blob) {
        const mimeType =
          resourceData.mimeType ??
          (mimeTypes.lookup(resourceData.uri ?? "") ||
            "application/octet-stream");
        if (isSupportedMimeType(mimeType)) {
          return {
            type: "file",
            mediaType: mimeType,
            data: Buffer.from(resourceData.blob, "base64"),
          };
        } else {
          return makeTextContentFromResource(resourceData);
        }
      }

      // Handle text resource content
      if (resourceData.text) {
        const mimeType =
          resourceData.mimeType ??
          (mimeTypes.lookup(resourceData.uri ?? "") || "text/plain");

        if (isSupportedMimeType(mimeType)) {
          return {
            type: "file",
            mediaType: mimeType,
            data: Buffer.from(resourceData.text),
            filename: resourceData.uri,
          };
        }

        return makeTextContentFromResource(resourceData);
      }
      throw new Error("Resource has no text or blob content");
    }

    case "file": {
      if (!part.file.file_data) {
        throw new Error("File has no file_data");
      }
      const mimeType = part.file.filename
        ? mimeTypes.lookup(part.file.filename) || "application/octet-stream"
        : "application/octet-stream";
      return {
        type: "file",
        mediaType: mimeType,
        data: part.file.file_data,
      };
    }

    case ContentPartType.InputAudio: {
      return {
        type: "file",
        mediaType: `audio/${part.input_audio.format}`,
        data: part.input_audio.data,
      };
    }

    default: {
      // The type system shows this should be unreachable, but we add a runtime check
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      throw new Error(`Unexpected content type: ${(part as any).type}`);
    }
  }
}

/**
 * Create text representation of resource with XML-style tags
 * Port from ai-sdk-client.ts:881-922
 */
const nonAttributeKeys = ["text", "blob", "uri", "annotations"];

function makeTextContentFromResource(resourceData: Resource): TextPart {
  const resourceProps = Object.entries(resourceData)
    .filter(([key]) => !nonAttributeKeys.includes(key))
    .map(([key, value]) => {
      if (key === "annotations") {
        return Object.entries(value)
          .filter(([, value]) => typeof value === "string")
          .map(([key, value]) => {
            return `${makeSafeMLKey(key)}="${makeSafeMLValue(value as string)}"`;
          })
          .join(" ");
      }
      if (typeof value !== "string") {
        return null;
      }
      return `${makeSafeMLKey(key)}="${makeSafeMLValue(value)}"`;
    })
    .filter((prop) => prop !== null)
    .join(" ");

  const text = resourceData.text || "";

  // Match original format exactly: newline after opening tag and before closing tag
  return {
    type: "text",
    text: `
<resource ${resourceProps}>
${text}
</resource>
`,
  } satisfies TextPart;
}

function makeSafeMLKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function makeSafeMLValue(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
