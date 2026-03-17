import {
  FinalizedRun,
  NormalizedContentPart,
  NormalizedMessage,
  NormalizedRequest,
  ToolDefinition,
  XmlToolCall
} from "../types.js";

interface OpenAiEvent {
  choices?: Array<{ delta?: { content?: string } }>;
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

    return [];
  });
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

        return {
          role: String(typed.role ?? "user") as NormalizedMessage["role"],
          content: normalizeContent(typed.content)
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
  for await (const raw of eventStream) {
    if (raw === "[DONE]") {
      return;
    }

    const parsed = JSON.parse(raw) as OpenAiEvent;
    const text = parsed.choices?.[0]?.delta?.content;
    if (text) {
      yield text;
    }
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
  ]
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

  events.push("data: [DONE]\n\n");
  return events;
};

