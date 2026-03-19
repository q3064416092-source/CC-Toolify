import {
  FinalizedRun,
  NormalizedContentPart,
  NormalizedMessage,
  NormalizedRequest,
  ToolDefinition,
  XmlToolCall
} from "../types.js";

interface AnthropicEvent {
  type: string;
  delta?: { text?: string };
  content_block?: { type?: string; text?: string };
}

const normalizeContent = (content: unknown): NormalizedContentPart[] => {
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }

  if (!Array.isArray(content)) {
    return [];
  }

  return content.flatMap((part): NormalizedContentPart[] => {
    if (!part || typeof part !== "object") {
      return [];
    }

    const typed = part as Record<string, unknown>;
    if (typed.type === "text" && typeof typed.text === "string") {
      return [{ type: "text", text: typed.text }];
    }

    if (typed.type === "tool_result") {
      return [
        {
          type: "tool_result",
          toolUseId: String(typed.tool_use_id ?? ""),
          content:
            typeof typed.content === "string"
              ? typed.content
              : JSON.stringify(typed.content ?? ""),
          isError: Boolean(typed.is_error)
        }
      ];
    }

    if (typed.type === "tool_use") {
      return [
        {
          type: "tool_use",
          id: String(typed.id ?? ""),
          name: String(typed.name ?? ""),
          input: (typed.input ?? {}) as Record<string, unknown>
        }
      ];
    }

    return [];
  });
};

export const decodeAnthropicRequest = (body: Record<string, unknown>): NormalizedRequest => ({
  protocol: "anthropic",
  model: String(body.model ?? ""),
  stream: Boolean(body.stream),
  maxTokens: typeof body.max_tokens === "number" ? body.max_tokens : undefined,
  temperature: typeof body.temperature === "number" ? body.temperature : undefined,
  systemPrompt: typeof body.system === "string" ? body.system : undefined,
  tools: (Array.isArray(body.tools) ? body.tools : []).map((tool) => {
    const typed = tool as Record<string, unknown>;
    return {
      name: String(typed.name ?? ""),
      description: typeof typed.description === "string" ? typed.description : undefined,
      inputSchema:
        typed.input_schema && typeof typed.input_schema === "object"
          ? (typed.input_schema as Record<string, unknown>)
          : undefined
    } satisfies ToolDefinition;
  }),
  messages: (Array.isArray(body.messages) ? body.messages : []).map((message) => {
    const typed = message as Record<string, unknown>;
    return {
      role: String(typed.role ?? "user") as NormalizedMessage["role"],
      content: normalizeContent(typed.content)
    };
  })
});

export const encodeAnthropicRequest = (request: NormalizedRequest): Record<string, unknown> => ({
  model: request.model,
  stream: true,
  max_tokens: request.maxTokens ?? 1024,
  temperature: request.temperature,
  system: request.systemPrompt,
  tools: request.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema ?? { type: "object", properties: {} }
  })),
  messages: request.messages.map((message) => ({
    role: message.role === "tool" ? "user" : message.role,
    content: message.content.map((part) => {
      if (part.type === "text") {
        return { type: "text", text: part.text };
      }
      if (part.type === "tool_result") {
        return {
          type: "tool_result",
          tool_use_id: part.toolUseId,
          content: part.content,
          is_error: part.isError ?? false
        };
      }
      if (part.type === "tool_use") {
        return {
          type: "tool_use",
          id: part.id,
          name: part.name,
          input: part.input
        };
      }
      return { type: "text", text: "" };
    })
  }))
});

export async function* normalizeFromAnthropicStream(
  eventStream: AsyncGenerator<string>
): AsyncGenerator<string> {
  for await (const raw of eventStream) {
    if (raw === "[DONE]") {
      return;
    }

    const parsed = JSON.parse(raw) as AnthropicEvent;
    if (parsed.type === "content_block_delta" && parsed.delta?.text) {
      yield parsed.delta.text;
    } else if (parsed.type === "content_block_start" && parsed.content_block?.text) {
      yield parsed.content_block.text;
    }
  }
}

const mapToolCalls = (toolCalls: XmlToolCall[]) =>
  toolCalls.map((toolCall) => ({
    type: "tool_use",
    id: toolCall.id,
    name: toolCall.name,
    input: toolCall.input
  }));

const mapUsage = (final: FinalizedRun) => ({
  input_tokens: final.usage.inputTokens,
  output_tokens: final.usage.outputTokens
});

export const encodeAnthropicResponse = (final: FinalizedRun): Record<string, unknown> => ({
  id: `msg_${Date.now()}`,
  type: "message",
  role: "assistant",
  model: "cc-toolify",
  stop_reason: final.output.toolCalls.length > 0 ? "tool_use" : final.stopReason,
  usage: mapUsage(final),
  content: [
    ...(final.output.text ? [{ type: "text", text: final.output.text }] : []),
    ...mapToolCalls(final.output.toolCalls)
  ]
});

export const encodeAnthropicStreamEvent = (
  final: FinalizedRun,
  eventIdSeed: number
): string[] => {
  const events: string[] = [];
  events.push(`data: ${JSON.stringify({ type: "message_start", message: { id: `msg_${eventIdSeed}`, type: "message", role: "assistant", model: "cc-toolify", usage: mapUsage(final), content: [] } })}\n\n`);

  if (final.output.text) {
    events.push(`data: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })}\n\n`);
    events.push(`data: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: final.output.text } })}\n\n`);
    events.push(`data: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`);
  }

  final.output.toolCalls.forEach((toolCall, index) => {
    events.push(`data: ${JSON.stringify({ type: "content_block_start", index: index + 1, content_block: { type: "tool_use", id: toolCall.id, name: toolCall.name, input: toolCall.input } })}\n\n`);
    events.push(`data: ${JSON.stringify({ type: "content_block_stop", index: index + 1 })}\n\n`);
  });

  events.push(`data: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: final.output.toolCalls.length > 0 ? "tool_use" : final.stopReason } })}\n\n`);
  events.push(`data: ${JSON.stringify({ type: "message_stop" })}\n\n`);
  events.push("data: [DONE]\n\n");
  return events;
};

export const encodeAnthropicStreamStart = (eventIdSeed: number, final: FinalizedRun): string =>
  `data: ${JSON.stringify({
    type: "message_start",
    message: {
      id: `msg_${eventIdSeed}`,
      type: "message",
      role: "assistant",
      model: "cc-toolify",
      usage: mapUsage(final),
      content: []
    }
  })}\n\n`;

export const encodeAnthropicTextBlockStart = (): string =>
  `data: ${JSON.stringify({
    type: "content_block_start",
    index: 0,
    content_block: { type: "text", text: "" }
  })}\n\n`;

export const encodeAnthropicTextDelta = (text: string): string =>
  `data: ${JSON.stringify({
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text }
  })}\n\n`;

export const encodeAnthropicTextBlockStop = (): string =>
  `data: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`;

export const encodeAnthropicToolCallBlock = (toolCall: XmlToolCall, index: number): string[] => [
  `data: ${JSON.stringify({
    type: "content_block_start",
    index,
    content_block: {
      type: "tool_use",
      id: toolCall.id,
      name: toolCall.name,
      input: toolCall.input
    }
  })}\n\n`,
  `data: ${JSON.stringify({ type: "content_block_stop", index })}\n\n`
];

export const encodeAnthropicStreamStop = (stopReason: FinalizedRun["stopReason"]): string[] => [
  `data: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: stopReason } })}\n\n`,
  `data: ${JSON.stringify({ type: "message_stop" })}\n\n`,
  "data: [DONE]\n\n"
];

