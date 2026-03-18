import { describe, expect, it } from "vitest";
import { decodeOpenAiRequest, normalizeFromOpenAiStream } from "../src/protocols/openai.js";

async function collect(generator: AsyncGenerator<string>): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of generator) {
    chunks.push(chunk);
  }
  return chunks;
}

describe("openai protocol", () => {
  it("decodes assistant tool call history from OpenAI payloads", () => {
    const request = decodeOpenAiRequest({
      model: "proxy-model",
      messages: [
        { role: "user", content: "hello" },
        {
          role: "assistant",
          content: "Working on it",
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: {
                name: "get_weather",
                arguments: "{\"city\":\"Shanghai\"}"
              }
            }
          ]
        },
        {
          role: "tool",
          tool_call_id: "call_1",
          content: "{\"temp\":24}"
        }
      ]
    });

    expect(request.messages[1]?.content).toEqual([
      { type: "text", text: "Working on it" },
      {
        type: "tool_use",
        id: "call_1",
        name: "get_weather",
        input: { city: "Shanghai" }
      }
    ]);
  });

  it("normalizes DeepSeek reasoning_content into think blocks", async () => {
    async function* stream(): AsyncGenerator<string> {
      yield JSON.stringify({
        choices: [{ delta: { reasoning_content: "first thought" } }]
      });
      yield JSON.stringify({
        choices: [{ delta: { reasoning_content: " second thought" } }]
      });
      yield JSON.stringify({
        choices: [{ delta: { content: "final answer" } }]
      });
      yield "[DONE]";
    }

    const chunks = await collect(normalizeFromOpenAiStream(stream()));
    expect(chunks).toEqual(["<think>\n", "first thought", " second thought", "\n</think>\n\n", "final answer"]);
  });
});
