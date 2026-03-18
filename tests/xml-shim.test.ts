import { describe, expect, it } from "vitest";
import { buildXmlShimPrompt, consumeXmlText, createParserState, finalizeXmlText, shapeMessagesForShim } from "../src/services/xml-shim.js";

describe("xml shim parser", () => {
  it("extracts a legacy tool call split across multiple chunks", () => {
    let state = createParserState();
    const first = consumeXmlText(state, "Need weather <tool_call><name>get_weather</name><arguments>{\"city\":", "legacy");
    state = first.state;
    expect(first.newText).toBe("Need weather ");
    expect(first.toolCalls).toHaveLength(0);

    const second = consumeXmlText(state, "\"Shanghai\"}</arguments></tool_call> done", "legacy");
    expect(second.toolCalls).toHaveLength(1);
    expect(second.toolCalls[0]?.name).toBe("get_weather");
    expect(second.toolCalls[0]?.input).toEqual({ city: "Shanghai" });
    expect(finalizeXmlText(second.state)).toContain("Need weather ");
  });

  it("extracts a private_v1 tool call", () => {
    const consumed = consumeXmlText(
      createParserState(),
      "<ccx_tool><ccx_name>get_weather</ccx_name><ccx_arguments>{\"city\":\"Shanghai\"}</ccx_arguments></ccx_tool>",
      "private_v1"
    );
    expect(consumed.toolCalls).toHaveLength(1);
    expect(consumed.toolCalls[0]?.name).toBe("get_weather");
    expect(consumed.toolCalls[0]?.input).toEqual({ city: "Shanghai" });
  });

  it("private_v1 parser keeps backward compatibility with legacy blocks", () => {
    const consumed = consumeXmlText(
      createParserState(),
      "<tool_call><name>legacy_tool</name><arguments>{\"ok\":true}</arguments></tool_call>",
      "private_v1"
    );
    expect(consumed.toolCalls).toHaveLength(1);
    expect(consumed.toolCalls[0]?.name).toBe("legacy_tool");
    expect(consumed.toolCalls[0]?.input).toEqual({ ok: true });
  });

  it("keeps malformed tool XML as visible text", () => {
    const consumed = consumeXmlText(createParserState(), "Hello <tool_call><name>oops</name></tool_call>", "legacy");
    expect(consumed.toolCalls).toHaveLength(0);
    expect(finalizeXmlText(consumed.state)).toContain("<tool_call>");
  });

  it("extracts a tool call when the opening tag is split across chunks", () => {
    let state = createParserState();
    const first = consumeXmlText(state, "Before <ccx_t", "private_v1");
    state = first.state;
    expect(first.newText).toBe("Before ");
    expect(first.toolCalls).toHaveLength(0);

    const second = consumeXmlText(
      state,
      "ool><ccx_name>get_weather</ccx_name><ccx_arguments>{\"city\":\"Shanghai\"}</ccx_arguments></ccx_tool> after",
      "private_v1"
    );
    expect(second.toolCalls).toHaveLength(1);
    expect(second.toolCalls[0]?.name).toBe("get_weather");
    expect(second.toolCalls[0]?.input).toEqual({ city: "Shanghai" });
    expect(second.newText).toBe(" after");
    expect(finalizeXmlText(second.state)).toBe("Before  after");
  });

  it("extracts consecutive tool calls in a single chunk", () => {
    const consumed = consumeXmlText(
      createParserState(),
      "<ccx_tool><ccx_name>first</ccx_name><ccx_arguments>{\"a\":1}</ccx_arguments></ccx_tool><ccx_tool><ccx_name>second</ccx_name><ccx_arguments>{\"b\":2}</ccx_arguments></ccx_tool>",
      "private_v1"
    );
    expect(consumed.toolCalls).toHaveLength(2);
    expect(consumed.toolCalls[0]?.name).toBe("first");
    expect(consumed.toolCalls[1]?.name).toBe("second");
    expect(consumed.toolCalls[0]?.input).toEqual({ a: 1 });
    expect(consumed.toolCalls[1]?.input).toEqual({ b: 2 });
  });

  it("renders private_v1 prompt and history without legacy tags", () => {
    const prompt = buildXmlShimPrompt([{ name: "get_weather" }], "private_v1");
    expect(prompt).toContain("<ccx_tool>");
    expect(prompt).not.toContain("<tool_call><name>");

    const messages = shapeMessagesForShim([
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "tool_1",
            name: "get_weather",
            input: { city: "Shanghai" }
          },
          {
            type: "tool_result",
            toolUseId: "tool_1",
            content: "{\"temp\":24}"
          }
        ]
      }
    ], "private_v1");

    expect(messages[0]?.content).toContain("<ccx_tool>");
    expect(messages[0]?.content).toContain("<ccx_result");
    expect(messages[0]?.content).not.toContain("<tool_call>");
    expect(messages[0]?.content).not.toContain("<tool_result");
  });
});
