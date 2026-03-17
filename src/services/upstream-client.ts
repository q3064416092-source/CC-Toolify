import { normalizeFromAnthropicStream } from "../protocols/anthropic.js";
import { normalizeFromOpenAiStream } from "../protocols/openai.js";
import { RuntimeModelConfig } from "../types.js";
import { parseSseStream } from "../utils/sse.js";

export class UpstreamClient {
  async streamText(
    runtime: RuntimeModelConfig,
    payload: unknown,
    signal?: AbortSignal
  ): Promise<AsyncGenerator<string>> {
    const response = await fetch(this.resolveEndpoint(runtime), {
      method: "POST",
      headers: this.buildHeaders(runtime),
      body: JSON.stringify(payload),
      signal
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Upstream request failed (${response.status}): ${detail}`);
    }

    if (!response.body) {
      throw new Error("Upstream response body missing");
    }

    const events = parseSseStream(response.body);
    return runtime.provider.protocol === "anthropic"
      ? normalizeFromAnthropicStream(events)
      : normalizeFromOpenAiStream(events);
  }

  private resolveEndpoint(runtime: RuntimeModelConfig): string {
    const base = runtime.provider.baseUrl.replace(/\/$/, "");
    return runtime.provider.protocol === "anthropic"
      ? `${base}/v1/messages`
      : `${base}/v1/chat/completions`;
  }

  private buildHeaders(runtime: RuntimeModelConfig): Record<string, string> {
    if (runtime.provider.protocol === "anthropic") {
      return {
        "Content-Type": "application/json",
        "x-api-key": runtime.provider.apiKey,
        "anthropic-version": "2023-06-01"
      };
    }

    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${runtime.provider.apiKey}`
    };
  }
}
