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

  it("keeps natural-language lead-in while extracting the following tool call", () => {
    const consumed = consumeXmlText(
      createParserState(),
      "I will inspect the repository first.\n<ccx_tool><ccx_name>list_files</ccx_name><ccx_arguments>{\"path\":\".\"}</ccx_arguments></ccx_tool>",
      "private_v1"
    );
    expect(consumed.newText).toBe("I will inspect the repository first.\n");
    expect(consumed.toolCalls).toHaveLength(1);
    expect(consumed.toolCalls[0]?.name).toBe("list_files");
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
    expect(prompt).toContain("You may include a short natural-language lead-in before a tool call");

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

  it("accepts Claude Code style direct tool call with parentheses when explicitly enabled", () => {
    const consumed = consumeXmlText(
      createParserState(),
      "Let me inspect.\nRead({\"file_path\":\"/repo/package.json\"})",
      "private_v1",
      ["Read"]
    );
    expect(consumed.newText).toBe("Let me inspect.\n");
    expect(consumed.toolCalls).toHaveLength(1);
    expect(consumed.toolCalls[0]?.name).toBe("Read");
    expect(consumed.toolCalls[0]?.input).toEqual({ file_path: "/repo/package.json" });
  });

  it("accepts Claude Code style direct tool call with braces when explicitly enabled", () => {
    const consumed = consumeXmlText(
      createParserState(),
      "Agent{\"description\":\"explore\",\"prompt\":\"scan project\"}",
      "private_v1",
      ["Agent"]
    );
    expect(consumed.toolCalls).toHaveLength(1);
    expect(consumed.toolCalls[0]?.name).toBe("Agent");
    expect(consumed.toolCalls[0]?.input).toEqual({ description: "explore", prompt: "scan project" });
  });

  it("does not parse Claude Code style direct calls unless the tool is explicitly enabled", () => {
    const consumed = consumeXmlText(
      createParserState(),
      "Read({\"file_path\":\"/repo/package.json\"})",
      "private_v1"
    );
    expect(consumed.toolCalls).toHaveLength(0);
    expect(finalizeXmlText(consumed.state)).toBe("Read({\"file_path\":\"/repo/package.json\"})");
  });

  it("renders Claude Code compatibility guidance for cc variant", () => {
    const prompt = buildXmlShimPrompt([{ name: "Read" }], "private_v1", "claude_code");
    expect(prompt).toContain("Claude Code compatibility mode is enabled.");
    expect(prompt).toContain("ToolName({...})");
  });
});
