import { appConfig } from "../config.js";
import { encodeAnthropicRequest } from "../protocols/anthropic.js";
import { encodeOpenAiRequest } from "../protocols/openai.js";
import { FinalizedRun, NormalizedRequest, RuntimeModelConfig } from "../types.js";
import { UpstreamClient } from "./upstream-client.js";
import {
  buildXmlShimPrompt,
  consumeXmlText,
  createParserState,
  finalizeXmlText,
  shapeMessagesForShim
} from "./xml-shim.js";

export class OrchestratorService {
  constructor(private readonly upstreamClient: UpstreamClient) {}

  async run(runtime: RuntimeModelConfig, request: NormalizedRequest): Promise<FinalizedRun> {
    const shouldShim = runtime.mapping.requiresXmlShim === 1 && request.tools.length > 0;
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
    const timeout = setTimeout(() => controller.abort(), appConfig.requestTimeoutMs);

    try {
      const stream = await this.upstreamClient.streamText(runtime, payload, controller.signal);

      if (!shouldShim) {
        let plain = "";
        for await (const chunk of stream) {
          plain += chunk;
        }

        return {
          output: {
            text: plain,
            toolCalls: []
          },
          stopReason: "end_turn"
        };
      }

      let parser = createParserState();
      const toolCalls: import("../types.js").XmlToolCall[] = [];

      for await (const chunk of stream) {
        const consumed = consumeXmlText(parser, chunk);
        parser = consumed.state;
        toolCalls.push(...consumed.toolCalls);
        if (toolCalls.length >= appConfig.maxToolCalls) {
          break;
        }
      }

      return {
        output: {
          text: finalizeXmlText(parser).trim(),
          toolCalls: toolCalls.slice(0, appConfig.maxToolCalls)
        },
        stopReason: toolCalls.length > 0 ? "tool_use" : "end_turn"
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildShimPayload(runtime: RuntimeModelConfig, request: NormalizedRequest): Record<string, unknown> {
    const systemPrompt = [request.systemPrompt, buildXmlShimPrompt(request.tools)]
      .filter(Boolean)
      .join("\n\n");
    const messages = shapeMessagesForShim(request.messages);

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

