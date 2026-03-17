import crypto from "node:crypto";
import {
  NormalizedMessage,
  ParserState,
  ToolDefinition,
  XmlToolCall
} from "../types.js";

const TOOL_PATTERN = /<tool_call>([\s\S]*?)<\/tool_call>/g;

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

export const consumeXmlText = (
  state: ParserState,
  incomingText: string
): { state: ParserState; newText: string; toolCalls: XmlToolCall[] } => {
  const merged = state.buffer + incomingText;
  let plainText = "";
  const toolCalls: XmlToolCall[] = [];
  let cursor = 0;

  TOOL_PATTERN.lastIndex = 0;
  let match = TOOL_PATTERN.exec(merged);
  while (match) {
    plainText += merged.slice(cursor, match.index);
    const parsed = parseToolCall(match[1]);
    if (parsed) {
      toolCalls.push(parsed);
    } else {
      plainText += match[0];
    }
    cursor = match.index + match[0].length;
    match = TOOL_PATTERN.exec(merged);
  }

  const trailing = merged.slice(cursor);
  const openIndex = trailing.lastIndexOf("<tool_call>");
  let nextBuffer = "";
  if (openIndex >= 0 && trailing.indexOf("</tool_call>", openIndex) === -1) {
    plainText += trailing.slice(0, openIndex);
    nextBuffer = trailing.slice(openIndex);
  } else {
    plainText += trailing;
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
