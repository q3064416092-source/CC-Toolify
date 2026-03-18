import { describe, expect, it } from "vitest";
import { consumeXmlText, createParserState, finalizeXmlText } from "../src/services/xml-shim.js";

describe("xml shim parser", () => {
  it("extracts a tool call split across multiple chunks", () => {
    let state = createParserState();
    const first = consumeXmlText(state, "Need weather <tool_call><name>get_weather</name><arguments>{\"city\":");
    state = first.state;
    expect(first.newText).toBe("Need weather ");
    expect(first.toolCalls).toHaveLength(0);

    const second = consumeXmlText(state, "\"Shanghai\"}</arguments></tool_call> done");
    expect(second.toolCalls).toHaveLength(1);
    expect(second.toolCalls[0]?.name).toBe("get_weather");
    expect(second.toolCalls[0]?.input).toEqual({ city: "Shanghai" });
    expect(finalizeXmlText(second.state)).toContain("Need weather ");
  });

  it("keeps malformed tool XML as visible text", () => {
    const consumed = consumeXmlText(createParserState(), "Hello <tool_call><name>oops</name></tool_call>");
    expect(consumed.toolCalls).toHaveLength(0);
    expect(finalizeXmlText(consumed.state)).toContain("<tool_call>");
  });

  it("extracts a tool call when the opening tag is split across chunks", () => {
    let state = createParserState();
    const first = consumeXmlText(state, "Before <tool_");
    state = first.state;
    expect(first.newText).toBe("Before ");
    expect(first.toolCalls).toHaveLength(0);

    const second = consumeXmlText(
      state,
      "call><name>get_weather</name><arguments>{\"city\":\"Shanghai\"}</arguments></tool_call> after"
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
      "<tool_call><name>first</name><arguments>{\"a\":1}</arguments></tool_call><tool_call><name>second</name><arguments>{\"b\":2}</arguments></tool_call>"
    );
    expect(consumed.toolCalls).toHaveLength(2);
    expect(consumed.toolCalls[0]?.name).toBe("first");
    expect(consumed.toolCalls[1]?.name).toBe("second");
    expect(consumed.toolCalls[0]?.input).toEqual({ a: 1 });
    expect(consumed.toolCalls[1]?.input).toEqual({ b: 2 });
  });
});
