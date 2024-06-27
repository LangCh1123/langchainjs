import type {
  MessageContentComplex,
  BaseMessage,
  UsageMetadata,
} from "@langchain/core/messages";
import {
  AIMessage,
  AIMessageChunk,
  ToolMessage,
} from "@langchain/core/messages";
import type { ToolCall } from "@langchain/core/messages/tool";
import type { ToolDefinition } from "@langchain/core/language_models/base";
import { isOpenAITool } from "@langchain/core/language_models/base";
import type {
  Message as BedrockMessage,
  SystemContentBlock as BedrockSystemContentBlock,
  Tool as BedrockTool,
  ContentBlock,
  ImageFormat,
  ConverseResponse,
  ContentBlockDeltaEvent,
  ConverseStreamMetadataEvent,
  ContentBlockStartEvent,
} from "@aws-sdk/client-bedrock-runtime";
import type { DocumentType as __DocumentType } from "@smithy/types";
import { StructuredToolInterface } from "@langchain/core/tools";
import { isStructuredTool } from "@langchain/core/utils/function_calling";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ChatGenerationChunk } from "@langchain/core/outputs";
import { BedrockToolChoice } from "./types.js";

export function extractImageInfo(base64: string): ContentBlock.ImageMember {
  // Extract the format from the base64 string
  const formatMatch = base64.match(/^data:image\/(\w+);base64,/);
  let format: ImageFormat | undefined;
  if (formatMatch) {
    const extractedFormat = formatMatch[1].toLowerCase();
    if (["gif", "jpeg", "png", "webp"].includes(extractedFormat)) {
      format = extractedFormat as ImageFormat;
    }
  }

  // Remove the data URL prefix if present
  const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");

  // Convert base64 to Uint8Array
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return {
    image: {
      format,
      source: {
        bytes,
      },
    },
  };
}

export function convertToConverseMessages(messages: BaseMessage[]): {
  converseMessages: BedrockMessage[];
  converseSystem: BedrockSystemContentBlock[];
} {
  const converseSystem: BedrockSystemContentBlock[] = messages
    .filter((msg) => msg._getType() === "system")
    .map((msg) => {
      const text = msg.content;
      if (typeof text !== "string") {
        throw new Error("System message content must be a string.");
      }
      return { text };
    });
  const converseMessages: BedrockMessage[] = messages
    .filter((msg) => !["system", "tool", "function"].includes(msg._getType()))
    .map((msg) => {
      if (msg._getType() === "ai") {
        const castMsg = msg as AIMessage;
        if (typeof castMsg.content === "string") {
          return {
            role: "assistant",
            content: [
              {
                text: castMsg.content,
              },
            ],
          };
        } else {
          if (castMsg.tool_calls && castMsg.tool_calls.length) {
            return {
              role: "assistant",
              content: castMsg.tool_calls.map((tc) => ({
                toolUse: {
                  toolUseId: tc.id,
                  name: tc.name,
                  input: tc.args,
                },
              })),
            };
          } else {
            const contentBlocks: ContentBlock[] = castMsg.content.map(
              (block) => {
                if (block.type === "text") {
                  return {
                    text: block.text,
                  };
                } else {
                  throw new Error(
                    `Unsupported content block type: ${block.type}`
                  );
                }
              }
            );
            return {
              role: "assistant",
              content: contentBlocks,
            };
          }
        }
      } else if (msg._getType() === "human" || msg._getType() === "generic") {
        if (typeof msg.content === "string") {
          return {
            role: "user",
            content: [
              {
                text: msg.content,
              },
            ],
          };
        } else {
          const contentBlocks: ContentBlock[] = msg.content.flatMap((block) => {
            if (block.type === "image_url") {
              const base64: string =
                typeof block.image_url === "string"
                  ? block.image_url
                  : block.image_url.url;
              return extractImageInfo(base64);
            } else if (block.type === "text") {
              return {
                text: block.text,
              };
            } else {
              throw new Error(`Unsupported content block type: ${block.type}`);
            }
          });
          return {
            role: "user",
            content: contentBlocks,
          };
        }
      } else if (msg._getType() === "tool") {
        const castMsg = msg as ToolMessage;
        if (typeof castMsg.content === "string") {
          return {
            role: undefined,
            content: [
              {
                toolResult: {
                  toolUseId: castMsg.tool_call_id,
                  content: [
                    {
                      text: castMsg.content,
                    },
                  ],
                },
              },
            ],
          };
        } else {
          return {
            role: undefined,
            content: [
              {
                toolResult: {
                  toolUseId: castMsg.tool_call_id,
                  content: [
                    {
                      json: castMsg.content,
                    },
                  ],
                },
              },
            ],
          };
        }
      } else {
        throw new Error(`Unsupported message type: ${msg._getType()}`);
      }
    });

  return { converseMessages, converseSystem };
}

export function isBedrockTool(tool: unknown): tool is BedrockTool {
  if (typeof tool === "object" && tool && "toolSpec" in tool) {
    return true;
  }
  return false;
}

export function convertToConverseTools(
  tools: (
    | StructuredToolInterface
    | ToolDefinition
    | BedrockTool
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    | Record<string, any>
  )[]
): BedrockTool[] {
  if (tools.every(isOpenAITool)) {
    return tools.map((tool) => ({
      toolSpec: {
        name: tool.function.name,
        description: tool.function.description,
        inputSchema: {
          json: tool.function.parameters as __DocumentType,
        },
      },
    }));
  } else if (tools.every(isStructuredTool)) {
    return tools.map((tool) => ({
      toolSpec: {
        name: tool.name,
        description: tool.description,
        inputSchema: {
          json: zodToJsonSchema(tool.schema) as __DocumentType,
        },
      },
    }));
  } else if (tools.every(isBedrockTool)) {
    return tools;
  }

  throw new Error(
    "Invalid tools passed. Must be an array of StructuredToolInterface, ToolDefinition, or BedrockTool."
  );
}

export function convertToBedrockToolChoice(
  toolChoice: string | BedrockToolChoice,
  tools: BedrockTool[]
): BedrockToolChoice {
  if (typeof toolChoice === "string") {
    switch (toolChoice) {
      case "any":
        return {
          any: {},
        };
      case "auto":
        return {
          auto: {},
        };
      default: {
        const foundTool = tools.find(
          (tool) => tool.toolSpec?.name === toolChoice
        );
        if (!foundTool) {
          throw new Error(
            `Tool with name ${toolChoice} not found in tools list.`
          );
        }
        return {
          tool: {
            name: toolChoice,
          },
        };
      }
    }
  }
  return toolChoice;
}

export function convertConverseMessageToLangChainMessage(
  message: BedrockMessage,
  responseMetadata: Omit<ConverseResponse, "output">
): BaseMessage {
  if (!message.content) {
    throw new Error("No message content found in response.");
  }
  if (message.role !== "assistant") {
    throw new Error(
      `Unsupported message role received in ChatBedrockConverse response: ${message.role}`
    );
  }
  let requestId: string | undefined;
  if (
    "$metadata" in responseMetadata &&
    responseMetadata.$metadata &&
    typeof responseMetadata.$metadata === "object" &&
    "requestId" in responseMetadata.$metadata
  ) {
    requestId = responseMetadata.$metadata.requestId as string;
  }
  let tokenUsage: UsageMetadata | undefined;
  if (responseMetadata.usage) {
    const input_tokens = responseMetadata.usage.inputTokens ?? 0;
    const output_tokens = responseMetadata.usage.outputTokens ?? 0;
    tokenUsage = {
      input_tokens,
      output_tokens,
      total_tokens:
        responseMetadata.usage.totalTokens ?? input_tokens + output_tokens,
    };
  }

  if (
    message.content?.length === 1 &&
    "text" in message.content[0] &&
    typeof message.content[0].text === "string"
  ) {
    return new AIMessage({
      content: message.content[0].text,
      response_metadata: responseMetadata,
      usage_metadata: tokenUsage,
      id: requestId,
    });
  } else {
    const toolCalls: ToolCall[] = [];
    const content: MessageContentComplex[] = [];
    message.content.forEach((c) => {
      if (
        "toolUse" in c &&
        c.toolUse &&
        c.toolUse.name &&
        c.toolUse.input &&
        typeof c.toolUse.input === "object"
      ) {
        toolCalls.push({
          id: c.toolUse.toolUseId,
          name: c.toolUse.name,
          args: c.toolUse.input,
        });
      } else if ("text" in c && typeof c.text === "string") {
        content.push({ type: "text", text: c.text });
      } else {
        content.push(c);
      }
    });
    return new AIMessage({
      content: content.length ? content : "",
      tool_calls: toolCalls.length ? toolCalls : undefined,
      response_metadata: responseMetadata,
      usage_metadata: tokenUsage,
      id: requestId,
    });
  }
}

export function handleConverseStreamContentBlockDelta(
  contentBlockDelta: ContentBlockDeltaEvent
): ChatGenerationChunk {
  if (!contentBlockDelta.delta) {
    throw new Error("No delta found in content block.");
  }
  if (contentBlockDelta.delta.text) {
    return new ChatGenerationChunk({
      text: contentBlockDelta.delta.text,
      message: new AIMessageChunk({
        content: contentBlockDelta.delta.text,
      }),
    });
  } else if (contentBlockDelta.delta.toolUse) {
    const index = contentBlockDelta.contentBlockIndex;
    return new ChatGenerationChunk({
      text: "",
      message: new AIMessageChunk({
        content: "",
        tool_call_chunks: [
          {
            args: contentBlockDelta.delta.toolUse.input,
            index,
          },
        ],
      }),
    });
  } else {
    const unsupportedField = Object.entries(contentBlockDelta.delta).filter(
      ([_, value]) => !!value
    );
    throw new Error(
      `Unsupported content block type: ${unsupportedField[0][0]}`
    );
  }
}

export function handleConverseStreamContentBlockStart(
  contentBlockStart: ContentBlockStartEvent
): ChatGenerationChunk {
  const index = contentBlockStart.contentBlockIndex;
  if (contentBlockStart.start?.toolUse) {
    return new ChatGenerationChunk({
      text: "",
      message: new AIMessageChunk({
        content: "",
        tool_call_chunks: [
          {
            name: contentBlockStart.start.toolUse.name,
            id: contentBlockStart.start.toolUse.toolUseId,
            index,
          },
        ],
      }),
    });
  }
  throw new Error("Unsupported content block start event.");
}

export function handleConverseStreamMetadata(
  metadata: ConverseStreamMetadataEvent,
  extra: {
    streamUsage: boolean;
  }
): ChatGenerationChunk {
  const inputTokens = metadata.usage?.inputTokens ?? 0;
  const outputTokens = metadata.usage?.outputTokens ?? 0;
  const usage_metadata: UsageMetadata = {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: metadata.usage?.totalTokens ?? inputTokens + outputTokens,
  };
  return new ChatGenerationChunk({
    text: "",
    message: new AIMessageChunk({
      content: "",
      usage_metadata: extra.streamUsage ? usage_metadata : undefined,
      response_metadata: {
        // Use the same key as returned from the Converse API
        metadata,
      },
    }),
  });
}
