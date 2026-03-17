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
});
