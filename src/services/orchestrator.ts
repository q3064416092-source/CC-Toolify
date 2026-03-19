import { appConfig } from "../config.js";
import { encodeAnthropicRequest } from "../protocols/anthropic.js";
import { encodeOpenAiRequest } from "../protocols/openai.js";
import {
  FinalizedRun,
  NormalizedRequest,
  RuntimeModelConfig,
  TokenUsage,
  XmlToolCall
} from "../types.js";
import { UpstreamClient } from "./upstream-client.js";
import {
  buildXmlShimPrompt,
  consumeXmlText,
  createParserState,
  finalizeXmlText,
  shapeMessagesForShim
} from "./xml-shim.js";

export interface StreamRunChunk {
  textDelta: string;
}

export interface StreamRunResult {
  stream: AsyncGenerator<StreamRunChunk>;
  finalized: Promise<FinalizedRun>;
}

const estimateTokenCount = (value: string): number => {
  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }

  return Math.max(1, Math.ceil(trimmed.length / 4));
};

const stringifyRequestForUsage = (request: NormalizedRequest): string => {
  const messages = request.messages
    .map((message) => `${message.role}:${message.content.map((part) => JSON.stringify(part)).join("\n")}`)
    .join("\n");

  const tools = request.tools.map((tool) => JSON.stringify(tool)).join("\n");

  return [request.systemPrompt ?? "", messages, tools].filter(Boolean).join("\n");
};

const stringifyOutputForUsage = (text: string, toolCalls: XmlToolCall[]): string => [
  text,
  ...toolCalls.map((toolCall) => JSON.stringify(toolCall))
].join("\n");

const buildEstimatedUsage = (
  request: NormalizedRequest,
  text: string,
  toolCalls: XmlToolCall[]
): TokenUsage => {
  const inputTokens = estimateTokenCount(stringifyRequestForUsage(request));
  const outputTokens = estimateTokenCount(stringifyOutputForUsage(text, toolCalls));

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    source: "estimated"
  };
};

export class OrchestratorService {
  constructor(private readonly upstreamClient: UpstreamClient) {}

  async run(runtime: RuntimeModelConfig, request: NormalizedRequest): Promise<FinalizedRun> {
    const run = await this.runStreaming(runtime, request);
    for await (const _chunk of run.stream) {
      // Drain stream for non-stream downstream clients.
    }
    return await run.finalized;
  }

  async runStreaming(runtime: RuntimeModelConfig, request: NormalizedRequest): Promise<StreamRunResult> {
    const shouldShim = request.tools.length > 0;
    const payload = shouldShim
      ? this.buildShimPayload(runtime, request)
      : runtime.provider.protocol === "anthropic"
        ? encodeAnthropicRequest({
            ...request,
            model: runtime.mapping.upstreamModel,
            stream: true
          })
        : encodeOpenAiRequest({
            ...request,
            model: runtime.mapping.upstreamModel,
            stream: true
          });

    const controller = new AbortController();
    const TOOL_ABORT_REASON = "tool_call_extracted";
    const timeout = setTimeout(() => {
      controller.abort(new Error(`Upstream request timed out after ${appConfig.requestTimeoutMs}ms`));
    }, appConfig.requestTimeoutMs);
    const upstream = await this.upstreamClient.streamText(runtime, payload, controller.signal);

    let fullText = "";
    let parser = createParserState();
    const toolCalls: XmlToolCall[] = [];

    let resolveFinalized!: (value: FinalizedRun) => void;
    let rejectFinalized!: (reason?: unknown) => void;
    const finalized = new Promise<FinalizedRun>((resolve, reject) => {
      resolveFinalized = resolve;
      rejectFinalized = reject;
    });

    const finish = (stopReason: FinalizedRun["stopReason"]): void => {
      const text = shouldShim ? finalizeXmlText(parser).trim() : fullText;
      const finalToolCalls = toolCalls.slice(0, appConfig.maxToolCalls);

      resolveFinalized({
        output: {
          text,
          toolCalls: finalToolCalls
        },
        stopReason: toolCalls.length > 0 ? "tool_use" : stopReason,
        usage: buildEstimatedUsage(request, text, finalToolCalls)
      });
    };

    const stream = (async function* (): AsyncGenerator<StreamRunChunk> {
      try {
        if (!shouldShim) {
          for await (const chunk of upstream) {
            if (!chunk) {
              continue;
            }
            fullText += chunk;
            yield { textDelta: chunk };
          }
          finish("end_turn");
          return;
        }

        for await (const chunk of upstream) {
          const consumed = consumeXmlText(
            parser,
            chunk,
            runtime.provider.shimStyle,
            runtime.variant === "claude_code" ? request.tools.map((tool) => tool.name) : []
          );
          parser = consumed.state;

          if (consumed.newText) {
            yield { textDelta: consumed.newText };
          }

          if (consumed.toolCalls.length > 0) {
            toolCalls.push(...consumed.toolCalls);
          }

          if (toolCalls.length >= appConfig.maxToolCalls || toolCalls.length > 0) {
            controller.abort(TOOL_ABORT_REASON);
            break;
          }
        }

        finish(toolCalls.length > 0 ? "tool_use" : "end_turn");
      } catch (error) {
        const reason = controller.signal.reason;
        if (error instanceof Error && error.name === "AbortError" && reason === TOOL_ABORT_REASON) {
          finish("tool_use");
          return;
        }
        rejectFinalized(error);
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    })();

    return { stream, finalized };
  }

  private buildShimPayload(runtime: RuntimeModelConfig, request: NormalizedRequest): Record<string, unknown> {
    const systemPrompt = [request.systemPrompt, buildXmlShimPrompt(request.tools, runtime.provider.shimStyle, runtime.variant)]
      .filter(Boolean)
      .join("\n\n");
    const messages = shapeMessagesForShim(request.messages, runtime.provider.shimStyle);

    if (runtime.provider.protocol === "anthropic") {
      return {
        model: runtime.mapping.upstreamModel,
        stream: true,
        max_tokens: request.maxTokens ?? 1024,
        temperature: request.temperature,
        system: systemPrompt,
        messages
      };
    }

    return {
      model: runtime.mapping.upstreamModel,
      stream: true,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      messages: [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        ...messages
      ]
    };
  }
}
