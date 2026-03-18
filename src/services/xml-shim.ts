import crypto from "node:crypto";
import {
  NormalizedMessage,
  ParserState,
  ToolDefinition,
  XmlToolCall
} from "../types.js";

const OPEN_TOOL_TAG = "<tool_call>";
const CLOSE_TOOL_TAG = "</tool_call>";

const extractTag = (body: string, tag: string): string | null => {
  const match = body.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match ? match[1].trim() : null;
};

const parseToolCall = (innerXml: string): XmlToolCall | null => {
  const name = extractTag(innerXml, "name");
  const argumentsText = extractTag(innerXml, "arguments");
  if (!name || !argumentsText) {
    return null;
  }

  try {
    return {
      id: `toolu_${crypto.randomUUID()}`,
      name,
      input: JSON.parse(argumentsText) as Record<string, unknown>,
      raw: `<tool_call>${innerXml}</tool_call>`
    };
  } catch {
    return null;
  }
};

export const buildXmlShimPrompt = (tools: ToolDefinition[]): string => {
  const renderedTools = tools.map((tool) => {
    const schema = tool.inputSchema ? JSON.stringify(tool.inputSchema) : "{}";
    return `- ${tool.name}: ${tool.description ?? "No description"} | input_schema=${schema}`;
  });

  return [
    "You do not have native tool calling.",
    "When a tool is required, emit exactly one or more XML blocks using this exact format:",
    "<tool_call><name>tool_name</name><arguments>{\"key\":\"value\"}</arguments></tool_call>",
    "Do not use markdown fences around the XML.",
    "Do not invent tools that are not listed.",
    "After tool results arrive, continue the answer normally unless another tool call is needed.",
    "Available tools:",
    ...renderedTools
  ].join("\n");
};

const renderMessageContentForShim = (message: NormalizedMessage): string => {
  return message.content
    .map((part) => {
      if (part.type === "text") {
        return part.text;
      }
      if (part.type === "tool_use") {
        return `<tool_call><name>${part.name}</name><arguments>${JSON.stringify(part.input)}</arguments></tool_call>`;
      }
      return `<tool_result tool_use_id="${part.toolUseId}" is_error="${part.isError ? "true" : "false"}">${part.content}</tool_result>`;
    })
    .join("\n");
};

export const shapeMessagesForShim = (
  messages: NormalizedMessage[]
): Array<{ role: "user" | "assistant"; content: string }> => {
  return messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: renderMessageContentForShim(message)
    }));
};

export const createParserState = (): ParserState => ({
  buffer: "",
  visibleText: ""
});

const findPartialOpenTagStart = (text: string): number => {
  const searchStart = Math.max(0, text.length - OPEN_TOOL_TAG.length + 1);
  for (let index = searchStart; index < text.length; index += 1) {
    if (OPEN_TOOL_TAG.startsWith(text.slice(index))) {
      return index;
    }
  }

  return -1;
};

export const consumeXmlText = (
  state: ParserState,
  incomingText: string
): { state: ParserState; newText: string; toolCalls: XmlToolCall[] } => {
  let remaining = state.buffer + incomingText;
  let plainText = "";
  const toolCalls: XmlToolCall[] = [];
  let nextBuffer = "";

  while (remaining) {
    const openIndex = remaining.indexOf(OPEN_TOOL_TAG);
    if (openIndex < 0) {
      const partialOpenIndex = findPartialOpenTagStart(remaining);
      if (partialOpenIndex >= 0) {
        plainText += remaining.slice(0, partialOpenIndex);
        nextBuffer = remaining.slice(partialOpenIndex);
      } else {
        plainText += remaining;
      }
      break;
    }

    plainText += remaining.slice(0, openIndex);

    const closeIndex = remaining.indexOf(CLOSE_TOOL_TAG, openIndex + OPEN_TOOL_TAG.length);
    if (closeIndex < 0) {
      nextBuffer = remaining.slice(openIndex);
      break;
    }

    const innerXml = remaining.slice(openIndex + OPEN_TOOL_TAG.length, closeIndex);
    const parsed = parseToolCall(innerXml);
    if (parsed) {
      toolCalls.push(parsed);
    } else {
      plainText += remaining.slice(openIndex, closeIndex + CLOSE_TOOL_TAG.length);
    }

    remaining = remaining.slice(closeIndex + CLOSE_TOOL_TAG.length);
  }

  const nextVisible = state.visibleText + plainText;
  return {
    state: {
      buffer: nextBuffer,
      visibleText: nextVisible
    },
    newText: plainText,
    toolCalls
  };
};

export const finalizeXmlText = (state: ParserState): string => state.visibleText + state.buffer;
