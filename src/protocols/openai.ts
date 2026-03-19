import {
  FinalizedRun,
  NormalizedContentPart,
  NormalizedMessage,
  NormalizedRequest,
  ToolDefinition,
  XmlToolCall
} from "../types.js";

interface OpenAiEvent {
  choices?: Array<{
    delta?: {
      content?: string;
      reasoning?: unknown;
      reasoning_content?: unknown;
    };
  }>;
}

type OpenAiDelta = NonNullable<OpenAiEvent["choices"]>[number]["delta"];

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

    return [];
  });
};

const parseToolCallInput = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value !== "string" || !value.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

const normalizeAssistantToolCalls = (toolCalls: unknown): NormalizedContentPart[] => {
  if (!Array.isArray(toolCalls)) {
    return [];
  }

  return toolCalls.flatMap((toolCall): NormalizedContentPart[] => {
    if (!toolCall || typeof toolCall !== "object") {
      return [];
    }

    const typed = toolCall as Record<string, unknown>;
    const fn = (typed.function ?? {}) as Record<string, unknown>;
    const name = typeof fn.name === "string" ? fn.name : "";
    const id = typeof typed.id === "string" ? typed.id : "";
    if (!name || !id) {
      return [];
    }

    return [
      {
        type: "tool_use",
        id,
        name,
        input: parseToolCallInput(fn.arguments)
      }
    ];
  });
};

const extractReasoningText = (delta: OpenAiDelta | undefined): string | null => {
  if (!delta) {
    return null;
  }

  if (typeof delta.reasoning_content === "string" && delta.reasoning_content) {
    return delta.reasoning_content;
  }

  if (typeof delta.reasoning === "string" && delta.reasoning) {
    return delta.reasoning;
  }

  if (delta.reasoning && typeof delta.reasoning === "object") {
    const typed = delta.reasoning as Record<string, unknown>;
    if (typeof typed.text === "string" && typed.text) {
      return typed.text;
    }
    if (typeof typed.content === "string" && typed.content) {
      return typed.content;
    }
  }

  return null;
};

export const decodeOpenAiRequest = (body: Record<string, unknown>): NormalizedRequest => {
  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  const systemMessage = rawMessages.find(
    (message) => (message as Record<string, unknown>).role === "system"
  ) as Record<string, unknown> | undefined;

  return {
    protocol: "openai",
    model: String(body.model ?? ""),
    stream: Boolean(body.stream),
    maxTokens: typeof body.max_tokens === "number" ? body.max_tokens : undefined,
    temperature: typeof body.temperature === "number" ? body.temperature : undefined,
    systemPrompt: typeof systemMessage?.content === "string" ? systemMessage.content : undefined,
    tools: (Array.isArray(body.tools) ? body.tools : []).map((tool) => {
      const typed = tool as Record<string, unknown>;
      const fn = (typed.function ?? {}) as Record<string, unknown>;
      return {
        name: String(fn.name ?? ""),
        description: typeof fn.description === "string" ? fn.description : undefined,
        inputSchema:
          fn.parameters && typeof fn.parameters === "object"
            ? (fn.parameters as Record<string, unknown>)
            : undefined
      } satisfies ToolDefinition;
    }),
    messages: rawMessages
      .filter((message) => (message as Record<string, unknown>).role !== "system")
      .map((message) => {
        const typed = message as Record<string, unknown>;
        if (typed.role === "tool") {
          return {
            role: "tool",
            content: [
              {
                type: "tool_result",
                toolUseId: String(typed.tool_call_id ?? ""),
                content: String(typed.content ?? "")
              }
            ]
          } satisfies NormalizedMessage;
        }

        const content = normalizeContent(typed.content);
        if (typed.role === "assistant") {
          content.push(...normalizeAssistantToolCalls(typed.tool_calls));
        }

        return {
          role: String(typed.role ?? "user") as NormalizedMessage["role"],
          content
        };
      })
  };
};

export const encodeOpenAiRequest = (request: NormalizedRequest): Record<string, unknown> => {
  const messages: Array<Record<string, unknown>> = [];
  if (request.systemPrompt) {
    messages.push({ role: "system", content: request.systemPrompt });
  }

  for (const message of request.messages) {
    if (message.role === "tool") {
      const toolResult = message.content.find((part) => part.type === "tool_result");
      if (toolResult && toolResult.type === "tool_result") {
        messages.push({
          role: "tool",
          tool_call_id: toolResult.toolUseId,
          content: toolResult.content
        });
      }
      continue;
    }

    messages.push({
      role: message.role,
      content: message.content
        .filter((part) => part.type === "text")
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("\n")
    });
  }

  return {
    model: request.model,
    stream: true,
    max_tokens: request.maxTokens,
    temperature: request.temperature,
    tools: request.tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema ?? { type: "object", properties: {} }
      }
    })),
    messages
  };
};

export async function* normalizeFromOpenAiStream(
  eventStream: AsyncGenerator<string>
): AsyncGenerator<string> {
  let reasoningOpen = false;

  for await (const raw of eventStream) {
    if (raw === "[DONE]") {
      if (reasoningOpen) {
        yield "</think>\n\n";
      }
      return;
    }

    const parsed = JSON.parse(raw) as OpenAiEvent;
    const delta = parsed.choices?.[0]?.delta;
    const reasoning = extractReasoningText(delta);
    if (reasoning) {
      if (!reasoningOpen) {
        yield "<think>\n";
        reasoningOpen = true;
      }
      yield reasoning;
    }

    const text = delta?.content;
    if (text) {
      if (reasoningOpen) {
        yield "\n</think>\n\n";
        reasoningOpen = false;
      }
      yield text;
    }
  }

  if (reasoningOpen) {
    yield "</think>\n\n";
  }
}

const mapToolCalls = (toolCalls: XmlToolCall[]) =>
  toolCalls.map((toolCall) => ({
    id: toolCall.id,
    type: "function",
    function: {
      name: toolCall.name,
      arguments: JSON.stringify(toolCall.input)
    }
  }));

const mapUsage = (final: FinalizedRun) => ({
  prompt_tokens: final.usage.inputTokens,
  completion_tokens: final.usage.outputTokens,
  total_tokens: final.usage.totalTokens
});

export const encodeOpenAiResponse = (final: FinalizedRun): Record<string, unknown> => ({
  id: `chatcmpl_${Date.now()}`,
  object: "chat.completion",
  created: Math.floor(Date.now() / 1000),
  model: "cc-toolify",
  choices: [
    {
      index: 0,
      finish_reason: final.output.toolCalls.length > 0 ? "tool_calls" : "stop",
      message: {
        role: "assistant",
        content: final.output.text,
        tool_calls: final.output.toolCalls.length > 0 ? mapToolCalls(final.output.toolCalls) : undefined
      }
    }
  ],
  usage: mapUsage(final)
});

export const encodeOpenAiStreamEvents = (final: FinalizedRun): string[] => {
  const events: string[] = [];
  if (final.output.text) {
    events.push(`data: ${JSON.stringify({ id: `chatcmpl_${Date.now()}`, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: "cc-toolify", choices: [{ index: 0, delta: { role: "assistant", content: final.output.text }, finish_reason: null }] })}\n\n`);
  }

  if (final.output.toolCalls.length > 0) {
    events.push(`data: ${JSON.stringify({ id: `chatcmpl_${Date.now()}`, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: "cc-toolify", choices: [{ index: 0, delta: { tool_calls: mapToolCalls(final.output.toolCalls) }, finish_reason: "tool_calls" }] })}\n\n`);
  } else {
    events.push(`data: ${JSON.stringify({ id: `chatcmpl_${Date.now()}`, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: "cc-toolify", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`);
  }

  events.push(`data: ${JSON.stringify({ id: `chatcmpl_${Date.now()}`, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: "cc-toolify", choices: [], usage: mapUsage(final) })}\n\n`);
  events.push("data: [DONE]\n\n");
  return events;
};

export const encodeOpenAiStreamRoleChunk = (): string =>
  `data: ${JSON.stringify({
    id: `chatcmpl_${Date.now()}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "cc-toolify",
    choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }]
  })}\n\n`;

export const encodeOpenAiTextDelta = (text: string): string =>
  `data: ${JSON.stringify({
    id: `chatcmpl_${Date.now()}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "cc-toolify",
    choices: [{ index: 0, delta: { content: text }, finish_reason: null }]
  })}\n\n`;

export const encodeOpenAiToolCallChunk = (toolCalls: XmlToolCall[]): string =>
  `data: ${JSON.stringify({
    id: `chatcmpl_${Date.now()}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "cc-toolify",
    choices: [{ index: 0, delta: { tool_calls: mapToolCalls(toolCalls) }, finish_reason: "tool_calls" }]
  })}\n\n`;

export const encodeOpenAiStreamStop = (finishReason: "stop" | "tool_calls", final: FinalizedRun): string[] => [
  `data: ${JSON.stringify({
    id: `chatcmpl_${Date.now()}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "cc-toolify",
    choices: [{ index: 0, delta: {}, finish_reason: finishReason }]
  })}\n\n`,
  `data: ${JSON.stringify({
    id: `chatcmpl_${Date.now()}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "cc-toolify",
    choices: [],
    usage: mapUsage(final)
  })}\n\n`,
  "data: [DONE]\n\n"
];


