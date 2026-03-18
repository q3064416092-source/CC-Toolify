import crypto from "node:crypto";
import {
  NormalizedMessage,
  ParserState,
  ToolDefinition,
  XmlShimStyle,
  XmlToolCall
} from "../types.js";

interface ShimDialect {
  style: XmlShimStyle;
  callTag: string;
  nameTag: string;
  argsTag: string;
  resultTag: string;
  resultToolUseIdAttr: string;
  resultErrorAttr: string;
}

const SHIM_DIALECTS: Record<XmlShimStyle, ShimDialect> = {
  legacy: {
    style: "legacy",
    callTag: "tool_call",
    nameTag: "name",
    argsTag: "arguments",
    resultTag: "tool_result",
    resultToolUseIdAttr: "tool_use_id",
    resultErrorAttr: "is_error"
  },
  private_v1: {
    style: "private_v1",
    callTag: "ccx_tool",
    nameTag: "ccx_name",
    argsTag: "ccx_arguments",
    resultTag: "ccx_result",
    resultToolUseIdAttr: "ccx_call_id",
    resultErrorAttr: "ccx_error"
  }
};

const getShimDialect = (style: XmlShimStyle): ShimDialect => SHIM_DIALECTS[style];

const getParserDialects = (style: XmlShimStyle): ShimDialect[] => {
  const preferred = getShimDialect(style);
  const fallback = style === "private_v1" ? getShimDialect("legacy") : getShimDialect("private_v1");
  return [preferred, fallback];
};

const openTag = (tag: string): string => `<${tag}>`;
const closeTag = (tag: string): string => `</${tag}>`;

const extractTag = (body: string, tag: string): string | null => {
  const match = body.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match ? match[1].trim() : null;
};

const renderToolCall = (dialect: ShimDialect, name: string, input: Record<string, unknown>): string =>
  `${openTag(dialect.callTag)}${openTag(dialect.nameTag)}${name}${closeTag(dialect.nameTag)}${openTag(dialect.argsTag)}${JSON.stringify(input)}${closeTag(dialect.argsTag)}${closeTag(dialect.callTag)}`;

const renderToolResult = (
  dialect: ShimDialect,
  toolUseId: string,
  isError: boolean,
  content: string
): string =>
  `<${dialect.resultTag} ${dialect.resultToolUseIdAttr}="${toolUseId}" ${dialect.resultErrorAttr}="${isError ? "true" : "false"}">${content}</${dialect.resultTag}>`;

const parseToolCall = (innerXml: string, dialect: ShimDialect): XmlToolCall | null => {
  const name = extractTag(innerXml, dialect.nameTag);
  const argumentsText = extractTag(innerXml, dialect.argsTag);
  if (!name || !argumentsText) {
    return null;
  }

  try {
    return {
      id: `toolu_${crypto.randomUUID()}`,
      name,
      input: JSON.parse(argumentsText) as Record<string, unknown>,
      raw: `${openTag(dialect.callTag)}${innerXml}${closeTag(dialect.callTag)}`
    };
  } catch {
    return null;
  }
};

export const buildXmlShimPrompt = (
  tools: ToolDefinition[],
  style: XmlShimStyle = "legacy"
): string => {
  const dialect = getShimDialect(style);
  const renderedTools = tools.map((tool) => {
    const schema = tool.inputSchema ? JSON.stringify(tool.inputSchema) : "{}";
    return `- ${tool.name}: ${tool.description ?? "No description"} | input_schema=${schema}`;
  });

  const example = renderToolCall(dialect, "tool_name", { key: "value" });
  const extraRule = style === "private_v1"
    ? `Never emit ${openTag("tool_call")} or any native tool-calling placeholder. Use only the custom CC-Toolify shim tags shown below.`
    : "Do not emit any alternative custom tag names.";

  return [
    "You do not have native tool calling.",
    "When a tool is required, emit exactly one or more XML blocks using this exact format:",
    example,
    extraRule,
    "Do not use markdown fences around the XML.",
    "Do not invent tools that are not listed.",
    "After tool results arrive, continue the answer normally unless another tool call is needed.",
    "Available tools:",
    ...renderedTools
  ].join("\n");
};

const renderMessageContentForShim = (
  message: NormalizedMessage,
  style: XmlShimStyle
): string => {
  const dialect = getShimDialect(style);
  return message.content
    .map((part) => {
      if (part.type === "text") {
        return part.text;
      }
      if (part.type === "tool_use") {
        return renderToolCall(dialect, part.name, part.input);
      }
      return renderToolResult(dialect, part.toolUseId, part.isError ?? false, part.content);
    })
    .join("\n");
};

export const shapeMessagesForShim = (
  messages: NormalizedMessage[],
  style: XmlShimStyle = "legacy"
): Array<{ role: "user" | "assistant"; content: string }> => {
  return messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: renderMessageContentForShim(message, style)
    }));
};

export const createParserState = (): ParserState => ({
  buffer: "",
  visibleText: ""
});

const findNextOpenTag = (
  text: string,
  dialects: ShimDialect[]
): { index: number; dialect: ShimDialect } | null => {
  let best: { index: number; dialect: ShimDialect } | null = null;

  for (const dialect of dialects) {
    const index = text.indexOf(openTag(dialect.callTag));
    if (index < 0) {
      continue;
    }
    if (!best || index < best.index) {
      best = { index, dialect };
    }
  }

  return best;
};

const findPartialOpenTagStart = (text: string, dialects: ShimDialect[]): number => {
  const maxOpenTagLength = Math.max(...dialects.map((dialect) => openTag(dialect.callTag).length));
  const searchStart = Math.max(0, text.length - maxOpenTagLength + 1);

  for (let index = searchStart; index < text.length; index += 1) {
    const candidate = text.slice(index);
    if (dialects.some((dialect) => openTag(dialect.callTag).startsWith(candidate))) {
      return index;
    }
  }

  return -1;
};

export const consumeXmlText = (
  state: ParserState,
  incomingText: string,
  style: XmlShimStyle = "legacy"
): { state: ParserState; newText: string; toolCalls: XmlToolCall[] } => {
  const dialects = getParserDialects(style);
  let remaining = state.buffer + incomingText;
  let plainText = "";
  const toolCalls: XmlToolCall[] = [];
  let nextBuffer = "";

  while (remaining) {
    const nextOpen = findNextOpenTag(remaining, dialects);
    if (!nextOpen) {
      const partialOpenIndex = findPartialOpenTagStart(remaining, dialects);
      if (partialOpenIndex >= 0) {
        plainText += remaining.slice(0, partialOpenIndex);
        nextBuffer = remaining.slice(partialOpenIndex);
      } else {
        plainText += remaining;
      }
      break;
    }

    const opening = openTag(nextOpen.dialect.callTag);
    const closing = closeTag(nextOpen.dialect.callTag);
    plainText += remaining.slice(0, nextOpen.index);

    const closeIndex = remaining.indexOf(closing, nextOpen.index + opening.length);
    if (closeIndex < 0) {
      nextBuffer = remaining.slice(nextOpen.index);
      break;
    }

    const innerXml = remaining.slice(nextOpen.index + opening.length, closeIndex);
    const parsed = parseToolCall(innerXml, nextOpen.dialect);
    if (parsed) {
      toolCalls.push(parsed);
    } else {
      plainText += remaining.slice(nextOpen.index, closeIndex + closing.length);
    }

    remaining = remaining.slice(closeIndex + closing.length);
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
