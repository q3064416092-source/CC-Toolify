import crypto from "node:crypto";
import {
  ModelVariant,
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

const normalizeJsonStringControls = (value: string): string => {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!;

    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      result += char;
      escaped = true;
      continue;
    }

    if (char === "\"") {
      result += char;
      inString = !inString;
      continue;
    }

    if (inString) {
      if (char === "\n") {
        result += "\\n";
        continue;
      }
      if (char === "\r") {
        result += "\\r";
        continue;
      }
      if (char === "\t") {
        result += "\\t";
        continue;
      }
    }

    result += char;
  }

  return result;
};

const extractBalancedJson = (value: string): string | null => {
  const trimmed = value.trim();
  const startIndex = trimmed.search(/[{[]/);
  if (startIndex < 0) {
    return null;
  }

  const startChar = trimmed[startIndex];
  const expectedEnd = startChar === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < trimmed.length; index += 1) {
    const char = trimmed[index]!;

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === startChar) {
      depth += 1;
      continue;
    }

    if (char === expectedEnd) {
      depth -= 1;
      if (depth === 0) {
        return trimmed.slice(startIndex, index + 1);
      }
    }
  }

  return null;
};

const stripTrailingClosers = (value: string): string => {
  let candidate = value.trim();

  while (candidate.length > 0) {
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      const last = candidate[candidate.length - 1];
      if (last !== "]" && last !== "}") {
        break;
      }
      candidate = candidate.slice(0, -1).trimEnd();
    }
  }

  return value.trim();
};

const tryParseJsonObject = (value: string): Record<string, unknown> | null => {
  const attempts = new Set<string>();
  const pushAttempt = (candidate: string | null | undefined): void => {
    if (!candidate) {
      return;
    }
    const normalized = candidate.trim();
    if (normalized) {
      attempts.add(normalized);
    }
  };

  pushAttempt(value);
  pushAttempt(normalizeJsonStringControls(value));

  const balanced = extractBalancedJson(value);
  pushAttempt(balanced);
  pushAttempt(balanced ? normalizeJsonStringControls(balanced) : null);

  for (const attempt of Array.from(attempts)) {
    const variants = [attempt, stripTrailingClosers(attempt)];
    for (const variant of variants) {
      try {
        const parsed = JSON.parse(variant);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // Continue to the next repair attempt.
      }
    }
  }

  return null;
};

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

const parseToolCall = (innerXml: string, dialect: ShimDialect): { toolCall: XmlToolCall | null; warning?: string } => {
  const name = extractTag(innerXml, dialect.nameTag);
  const argumentsText = extractTag(innerXml, dialect.argsTag);
  if (!name || !argumentsText) {
    return {
      toolCall: null,
      warning: `Malformed ${dialect.callTag} block: missing ${!name ? dialect.nameTag : dialect.argsTag}`
    };
  }

  const parsed = tryParseJsonObject(argumentsText);
  if (!parsed) {
    return {
      toolCall: null,
      warning: `Failed to parse tool arguments for ${name} via ${dialect.callTag}`
    };
  }

  return {
    toolCall: {
      id: `toolu_${crypto.randomUUID()}`,
      name,
      input: parsed,
      raw: `${openTag(dialect.callTag)}${innerXml}${closeTag(dialect.callTag)}`
    }
  };
};

const tryParseDirectToolInput = (name: string, raw: string): { toolCall: XmlToolCall | null; warning?: string } => {
  const parsed = tryParseJsonObject(raw);
  if (!parsed) {
    return {
      toolCall: null,
      warning: `Failed to parse direct tool arguments for ${name}`
    };
  }

  return {
    toolCall: {
      id: `toolu_${crypto.randomUUID()}`,
      name,
      input: parsed,
      raw
    }
  };
};

export const buildXmlShimPrompt = (
  tools: ToolDefinition[],
  style: XmlShimStyle = "legacy",
  variant: ModelVariant = "default"
): string => {
  const dialect = getShimDialect(style);
  const renderedTools = tools.map((tool) => {
    const schema = tool.inputSchema ? JSON.stringify(tool.inputSchema) : "{}";
    return `- ${tool.name}: ${tool.description ?? "No description"} | input_schema=${schema}`;
  });

  const example = renderToolCall(dialect, "tool_name", { key: "value" });
  const resultExample = renderToolResult(dialect, "tool_call_id", false, "{\"result\":\"value\"}");
  const extraRule = style === "private_v1"
    ? `Never emit ${openTag("tool_call")} or any native tool-calling placeholder. Use only the custom CC-Toolify shim tags shown below.`
    : "Do not emit any alternative custom tag names.";
  const variantRule = variant === "claude_code"
    ? [
        "Claude Code compatibility mode is enabled.",
        "If the available tools use Claude Code-style names such as Read, Glob, Grep, Bash or Agent, you may emit either the XML shim block or a direct compatibility call like ToolName({...}) or ToolName{...} with a JSON object.",
        "Only call tools that are listed below. If a Claude Code tool name is not listed, ignore it and do not mention missing tools."
      ].join("\n")
    : "";
  const hasLargeStringMutationTool = tools.some((tool) =>
    ["edit_file", "write_file", "apply_patch"].includes(tool.name)
  );
  const mutationRule = hasLargeStringMutationTool
    ? [
        "For write or edit tools, emit the tool call with no natural-language lead-in.",
        "The arguments payload must be valid JSON.",
        "When an argument contains multi-line replacement text, keep it inside a JSON string with escaped newlines."
      ].join("\n")
    : "";

  return [
    "You do not have native tool calling.",
    "When a tool is required, emit exactly one or more XML blocks using this exact format:",
    example,
    "You may include a short natural-language lead-in before a tool call when it helps the conversation flow.",
    "If you emit natural language before a tool call, keep it brief and then emit the tool-call block immediately.",
    "Do not describe fake tool execution, do not narrate internal tooling steps, and do not claim a tool exists unless it is listed below.",
    "Tool results will be returned to you in this format:",
    resultExample,
    extraRule,
    variantRule,
    mutationRule,
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
  style: XmlShimStyle = "legacy",
  directToolNames: string[] = []
): { state: ParserState; newText: string; toolCalls: XmlToolCall[]; warnings: string[] } => {
  const dialects = getParserDialects(style);
  let remaining = state.buffer + incomingText;
  let plainText = "";
  const toolCalls: XmlToolCall[] = [];
  const warnings: string[] = [];
  let nextBuffer = "";

  const sortedDirectToolNames = Array.from(new Set(directToolNames.filter(Boolean))).sort((a, b) => b.length - a.length);

  const isToolBoundary = (value: string | undefined): boolean => !value || !/[A-Za-z0-9_:-]/.test(value);

  const findMatchingBracketEnd = (text: string, startIndex: number, open: string, close: string): number => {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = startIndex; index < text.length; index += 1) {
      const char = text[index];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") {
        inString = !inString;
        continue;
      }
      if (inString) {
        continue;
      }
      if (char === open) {
        depth += 1;
        continue;
      }
      if (char === close) {
        depth -= 1;
        if (depth === 0) {
          return index;
        }
      }
    }

    return -1;
  };

  const parseDirectToolCallAt = (
    text: string,
    startIndex: number,
    name: string
  ): { index: number; endIndex: number; toolCall: XmlToolCall | null; warning?: string; incomplete: boolean } => {
    let cursor = startIndex + name.length;
    while (cursor < text.length && /\s/.test(text[cursor] ?? "")) {
      cursor += 1;
    }

    const opener = text[cursor];
    if (!opener) {
      return {
        index: startIndex,
        endIndex: startIndex,
        toolCall: null,
        incomplete: true
      };
    }

    if (opener === "{") {
      const end = findMatchingBracketEnd(text, cursor, "{", "}");
      if (end < 0) {
        return {
          index: startIndex,
          endIndex: startIndex,
          toolCall: null,
          incomplete: true
        };
      }

      const parsed = tryParseDirectToolInput(name, text.slice(cursor, end + 1));
      return {
        index: startIndex,
        endIndex: end + 1,
        toolCall: parsed.toolCall,
        warning: parsed.warning,
        incomplete: false
      };
    }

    if (opener !== "(") {
      return {
        index: startIndex,
        endIndex: startIndex,
        toolCall: null,
        incomplete: false
      };
    }

    const end = findMatchingBracketEnd(text, cursor, "(", ")");
    if (end < 0) {
      return {
        index: startIndex,
        endIndex: startIndex,
        toolCall: null,
        incomplete: true
      };
    }

    const parsed = tryParseDirectToolInput(name, text.slice(cursor + 1, end).trim());
    return {
      index: startIndex,
      endIndex: end + 1,
      toolCall: parsed.toolCall,
      warning: parsed.warning,
      incomplete: false
    };
  };

  const findNextDirectToolCall = (
    text: string
  ): { index: number; endIndex: number; toolCall: XmlToolCall | null; warning?: string; incomplete: boolean } | null => {
    let best:
      | { index: number; endIndex: number; toolCall: XmlToolCall | null; warning?: string; incomplete: boolean }
      | null = null;

    for (const name of sortedDirectToolNames) {
      let searchFrom = 0;
      while (searchFrom < text.length) {
        const index = text.indexOf(name, searchFrom);
        if (index < 0) {
          break;
        }

        if (!isToolBoundary(text[index - 1])) {
          searchFrom = index + name.length;
          continue;
        }

        let cursor = index + name.length;
        while (cursor < text.length && /\s/.test(text[cursor] ?? "")) {
          cursor += 1;
        }

        const opener = text[cursor];
        if (opener !== "(" && opener !== "{") {
          searchFrom = index + name.length;
          continue;
        }

        const parsed = parseDirectToolCallAt(text, index, name);
        if (!best || parsed.index < best.index) {
          best = parsed;
        }
        break;
      }
    }

    return best;
  };

  const findPartialDirectCallStart = (text: string): number => {
    if (sortedDirectToolNames.length === 0) {
      return -1;
    }

    const maxToolNameLength = Math.max(...sortedDirectToolNames.map((name) => name.length));
    const searchStart = Math.max(0, text.length - maxToolNameLength);

    for (let index = searchStart; index < text.length; index += 1) {
      const candidate = text.slice(index);
      const before = text[index - 1];
      if (!isToolBoundary(before)) {
        continue;
      }

      for (const name of sortedDirectToolNames) {
        if (name.startsWith(candidate)) {
          return index;
        }
      }
    }

    return -1;
  };

  while (remaining) {
    const nextOpen = findNextOpenTag(remaining, dialects);
    const nextDirect = findNextDirectToolCall(remaining);

    if (!nextOpen && !nextDirect) {
      const partialOpenIndex = findPartialOpenTagStart(remaining, dialects);
      const partialDirectIndex = findPartialDirectCallStart(remaining);
      const partialIndex = [partialOpenIndex, partialDirectIndex]
        .filter((value) => value >= 0)
        .sort((a, b) => a - b)[0] ?? -1;
      if (partialIndex >= 0) {
        plainText += remaining.slice(0, partialIndex);
        nextBuffer = remaining.slice(partialIndex);
      } else {
        plainText += remaining;
      }
      break;
    }

    if (nextDirect && (!nextOpen || nextDirect.index < nextOpen.index)) {
      plainText += remaining.slice(0, nextDirect.index);

      if (nextDirect.incomplete) {
        nextBuffer = remaining.slice(nextDirect.index);
        break;
      }

      if (nextDirect.toolCall) {
        toolCalls.push(nextDirect.toolCall);
        if (nextDirect.warning) {
          warnings.push(nextDirect.warning);
        }
      } else {
        if (nextDirect.warning) {
          warnings.push(nextDirect.warning);
        }
        plainText += remaining.slice(nextDirect.index, nextDirect.endIndex);
      }

      remaining = remaining.slice(nextDirect.endIndex);
      continue;
    }

    if (!nextOpen) {
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
    if (parsed.toolCall) {
      toolCalls.push(parsed.toolCall);
    } else {
      if (parsed.warning) {
        warnings.push(parsed.warning);
      }
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
    toolCalls,
    warnings
  };
};

export const finalizeXmlText = (state: ParserState): string => state.visibleText + state.buffer;
